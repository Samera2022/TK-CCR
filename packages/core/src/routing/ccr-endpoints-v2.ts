/**
 * CCR-specific API endpoints for model switching and orchestration
 * V2: Uses IncomingMessage directly
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { GatewayProviderConfig } from "@ccr/core/contracts/app";
import { findModelCatalogEntry, type ModelCatalogEntry } from "@ccr/core/gateway/model-catalog";
import { getSessionModelBindingManager } from "@ccr/core/gateway/session-model-binding";
import { readRequestBody, sendJson } from "@ccr/core/gateway/http/io";
import type { 
  AvailableModel, 
  SwitchModelRequest, 
  SwitchModelResponse 
} from "@ccr/core/models/model-switching-config";

/**
 * Check if the path is a CCR-specific endpoint
 */
export function isCcrEndpoint(path: string): boolean {
  const normalized = path.toLowerCase();
  return normalized.startsWith("/v1/ccr/") || normalized.startsWith("/ccr/");
}

/**
 * Route CCR-specific requests
 */
export async function handleCcrEndpoint(
  request: IncomingMessage,
  response: ServerResponse,
  path: string,
  providers: GatewayProviderConfig[]
): Promise<boolean> {
  const normalized = path.toLowerCase();
  const method = request.method?.toUpperCase() || "GET";

  // GET /v1/ccr/models
  if ((normalized === "/v1/ccr/models" || normalized === "/ccr/models") && method === "GET") {
    await handleGetModels(response, providers);
    return true;
  }

  // POST /v1/ccr/switch-model
  if ((normalized === "/v1/ccr/switch-model" || normalized === "/ccr/switch-model") && method === "POST") {
    await handleSwitchModel(request, response, providers);
    return true;
  }

  return false;
}

/**
 * GET /v1/ccr/models
 * Returns all available models from the model catalog
 */
async function handleGetModels(
  response: ServerResponse,
  providers: GatewayProviderConfig[]
): Promise<void> {
  try {
    // Get all available providers
    const providerNames = new Set(providers.map(p => p.name).filter(Boolean));
    
    // Get models from catalog
    const models = getAvailableModels(providerNames);

    sendJson(response, 200, { models });
  } catch (error) {
    sendJson(response, 500, {
      error: "internal_error",
      message: error instanceof Error ? error.message : "Failed to retrieve models",
    });
  }
}

/**
 * POST /v1/ccr/switch-model
 * Switches the current session's model
 */
async function handleSwitchModel(
  request: IncomingMessage,
  response: ServerResponse,
  providers: GatewayProviderConfig[]
): Promise<void> {
  try {
    // Parse request body
    const requestBody = await readRequestBody(request);
    const body = JSON.parse(requestBody.toString("utf8")) as SwitchModelRequest;
    const { model, reason } = body;

    if (!model || typeof model !== "string") {
      sendJson(response, 400, {
        error: "invalid_request",
        message: "Missing or invalid 'model' field",
      });
      return;
    }

    if (!reason || typeof reason !== "string") {
      sendJson(response, 400, {
        error: "invalid_request",
        message: "Missing or invalid 'reason' field",
      });
      return;
    }

    // Extract session info from headers
    const client = getHeaderString(request.headers["x-cc-switch-client"]) || "default";
    const sessionId = getHeaderString(request.headers["x-ccr-session-id"]) || "";

    // Check if model exists
    const modelEntry = findModelCatalogEntry(model);
    if (!modelEntry) {
      // Model not found, return available models
      const providerNames = new Set(providers.map(p => p.name).filter(Boolean));
      const availableModels = getAvailableModels(providerNames);
      
      const errorResponse: SwitchModelResponse = {
        success: false,
        error: "model_not_found",
        message: `Model '${model}' not found`,
        availableModels,
      };

      sendJson(response, 404, errorResponse);
      return;
    }

    // Get session manager and update binding
    const sessionManager = getSessionModelBindingManager();
    const sessionKey = sessionManager.getSessionKey(client, sessionId);
    const previousModel = sessionManager.getCurrentModel(sessionKey);
    
    sessionManager.setCurrentModel(sessionKey, modelEntry.id);

    // Log the switch for monitoring
    console.log(`[CCR] Model switch: session=${sessionKey}, from=${previousModel || "none"}, to=${modelEntry.id}, reason=${reason}`);

    const successResponse: SwitchModelResponse = {
      success: true,
      model: modelEntry.id,
      previousModel,
    };

    sendJson(response, 200, successResponse);
  } catch (error) {
    if (error instanceof SyntaxError) {
      sendJson(response, 400, {
        error: "invalid_json",
        message: "Invalid JSON in request body",
      });
      return;
    }
    
    sendJson(response, 500, {
      error: "internal_error",
      message: error instanceof Error ? error.message : "Failed to switch model",
    });
  }
}

/**
 * Get available models from catalog for given providers
 */
function getAvailableModels(providerNames: Set<string>): AvailableModel[] {
  const models: AvailableModel[] = [];
  
  // Common model IDs to check
  const commonModels = [
    "anthropic/claude-opus-5",
    "anthropic/claude-sonnet-4.5",
    "anthropic/claude-haiku-4",
    "openai/gpt-5.6-sol",
    "openai/gpt-5.6-terra",
    "openai/gpt-5.6-luna",
    "openai/gpt-4.5-preview",
    "openai/o1-preview",
    "openai/o1-mini",
    "deepseek/deepseek-v4",
    "google/gemini-2.5-flash",
    "google/gemini-2.5-pro",
  ];

  for (const modelId of commonModels) {
    const entry = findModelCatalogEntry(modelId);
    if (entry) {
      // Check if any of this model's providers are available
      const hasProvider = entry.providers?.some(p => 
        providerNames.has(p) || providerNames.has(p.toLowerCase())
      );
      
      if (hasProvider || providerNames.size === 0) {
        models.push(catalogEntryToAvailableModel(entry));
      }
    }
  }

  return models;
}

/**
 * Convert ModelCatalogEntry to AvailableModel
 */
function catalogEntryToAvailableModel(entry: ModelCatalogEntry): AvailableModel {
  const capabilities: string[] = [];
  
  if (entry.capabilities) {
    if (entry.capabilities.vision) capabilities.push("vision");
    if (entry.capabilities.toolCalling || entry.capabilities.functionCalling) {
      capabilities.push("tool_calling");
    }
    if (entry.capabilities.reasoning) capabilities.push("reasoning");
    if (entry.capabilities.webSearch) capabilities.push("web_search");
  }

  return {
    id: entry.id,
    displayName: entry.displayName || entry.model || entry.id,
    provider: entry.providers?.[0] || "unknown",
    contextTokens: entry.limits?.contextTokens || entry.limits?.inputTokens,
    capabilities: capabilities.length > 0 ? capabilities : undefined,
  };
}

function getHeaderString(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return value[0];
  return undefined;
}

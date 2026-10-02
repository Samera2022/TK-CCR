/**
 * CCR-specific API endpoints for model switching and orchestration
 */

import type { GatewayProviderConfig } from "@ccr/core/contracts/app";
import { findModelCatalogEntry, type ModelCatalogEntry } from "@ccr/core/gateway/model-catalog";
import { getSessionModelBindingManager } from "@ccr/core/gateway/session-model-binding";
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
  request: Request,
  providers: GatewayProviderConfig[]
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.toLowerCase();
  const method = request.method.toUpperCase();

  // GET /v1/ccr/models
  if ((path === "/v1/ccr/models" || path === "/ccr/models") && method === "GET") {
    return handleGetModels(providers);
  }

  // POST /v1/ccr/switch-model
  if ((path === "/v1/ccr/switch-model" || path === "/ccr/switch-model") && method === "POST") {
    return handleSwitchModel(request, providers);
  }

  return null;
}

/**
 * GET /v1/ccr/models
 * Returns all available models from the model catalog
 */
async function handleGetModels(
  providers: GatewayProviderConfig[]
): Promise<Response> {
  try {
    // Get all available providers
    const providerNames = new Set(providers.map(p => p.name).filter(Boolean));
    
    // Get models from catalog
    const models = getAvailableModels(providerNames);

    return new Response(
      JSON.stringify({ models }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "internal_error",
        message: error instanceof Error ? error.message : "Failed to retrieve models",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

/**
 * POST /v1/ccr/switch-model
 * Switches the current session's model
 */
async function handleSwitchModel(
  request: Request,
  providers: GatewayProviderConfig[]
): Promise<Response> {
  try {
    // Parse request body
    const body = await request.json() as SwitchModelRequest;
    const { model, reason } = body;

    if (!model || typeof model !== "string") {
      return createErrorResponse(
        "invalid_request",
        "Missing or invalid 'model' field",
        400
      );
    }

    if (!reason || typeof reason !== "string") {
      return createErrorResponse(
        "invalid_request",
        "Missing or invalid 'reason' field",
        400
      );
    }

    // Extract session info from headers
    const client = request.headers.get("x-cc-switch-client") || "default";
    const sessionId = request.headers.get("x-ccr-session-id") || "";

    // Check if model exists
    const modelEntry = findModelCatalogEntry(model);
    if (!modelEntry) {
      // Model not found, return available models
      const providerNames = new Set(providers.map(p => p.name).filter(Boolean));
      const availableModels = getAvailableModels(providerNames);
      
      const response: SwitchModelResponse = {
        success: false,
        error: "model_not_found",
        message: `Model '${model}' not found`,
        availableModels,
      };

      return new Response(JSON.stringify(response), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get session manager and update binding
    const sessionManager = getSessionModelBindingManager();
    const sessionKey = sessionManager.getSessionKey(client, sessionId);
    const previousModel = sessionManager.getCurrentModel(sessionKey);
    
    sessionManager.setCurrentModel(sessionKey, modelEntry.id);

    // Log the switch for monitoring
    console.log(`[CCR] Model switch: session=${sessionKey}, from=${previousModel || "none"}, to=${modelEntry.id}, reason=${reason}`);

    const response: SwitchModelResponse = {
      success: true,
      model: modelEntry.id,
      previousModel,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createErrorResponse(
        "invalid_json",
        "Invalid JSON in request body",
        400
      );
    }
    
    return createErrorResponse(
      "internal_error",
      error instanceof Error ? error.message : "Failed to switch model",
      500
    );
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

/**
 * Create error response
 */
function createErrorResponse(
  error: string,
  message: string,
  status: number
): Response {
  return new Response(
    JSON.stringify({ error, message }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
}

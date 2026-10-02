/**
 * CCR Unified API - Model switching, Budget tracking, and Orchestra management
 */

import type { GatewayProviderConfig } from "@ccr/core/contracts/app";
import { findModelCatalogEntry, type ModelCatalogEntry } from "@ccr/core/gateway/model-catalog";
import { getSessionModelBindingManager } from "@ccr/core/gateway/session-model-binding";
import { getBudgetTracker } from "@ccr/core/gateway/features/budget-tracker";
import { getOrchestraEngine } from "@ccr/core/gateway/features/orchestra-engine-v2";
import type { 
  AvailableModel, 
  SwitchModelRequest, 
  SwitchModelResponse 
} from "@ccr/core/models/model-switching-config";
import type { 
  BudgetConfirmationResponse,
} from "@ccr/core/models/budget-config";
import type { Role, OrchestraConfig } from "@ccr/core/models/orchestra-config";

/**
 * Check if the path is a CCR endpoint
 */
export function isCcrEndpoint(path: string): boolean {
  const normalized = path.toLowerCase();
  return normalized.startsWith("/v1/ccr/") || 
         normalized.startsWith("/ccr/") ||
         normalized.startsWith("/v2/ccr/");
}

/**
 * Route CCR requests
 */
export async function handleCcrEndpoint(
  request: Request,
  providers: GatewayProviderConfig[]
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.toLowerCase();
  const method = request.method.toUpperCase();

  // V1 Endpoints - Model switching
  if (path.match(/\/(v1\/)?ccr\/models/) && method === "GET") {
    return handleGetModels(providers);
  }

  if (path.match(/\/(v1\/)?ccr\/switch-model/) && method === "POST") {
    return handleSwitchModel(request, providers);
  }

  // V2 Endpoints - Budget management
  if (path.match(/\/(v2\/)?ccr\/(v2\/)?budget\/state/) && method === "GET") {
    return handleGetBudgetState(request);
  }

  if (path.match(/\/(v2\/)?ccr\/(v2\/)?budget\/confirm/) && method === "POST") {
    return handleBudgetConfirmation(request);
  }

  if (path.match(/\/(v2\/)?ccr\/(v2\/)?budget\/reset/) && method === "POST") {
    return handleBudgetReset(request);
  }

  // V2 Endpoints - Orchestra management
  if (path.match(/\/(v2\/)?ccr\/(v2\/)?orchestra\/config/) && method === "GET") {
    return handleGetOrchestraConfig();
  }

  if (path.match(/\/(v2\/)?ccr\/(v2\/)?orchestra\/config/) && method === "POST") {
    return handleUpdateOrchestraConfig(request);
  }

  if (path.match(/\/(v2\/)?ccr\/(v2\/)?orchestra\/roles/) && method === "GET") {
    return handleGetRoles();
  }

  if (path.match(/\/(v2\/)?ccr\/(v2\/)?orchestra\/roles/) && method === "POST") {
    return handleUpsertRole(request);
  }

  if (path.match(/\/(v2\/)?ccr\/(v2\/)?orchestra\/roles\/[^/]+/) && method === "DELETE") {
    return handleDeleteRole(request);
  }

  return null;
}

// ============================================================================
// V1 API - Model Switching
// ============================================================================

/**
 * GET /v1/ccr/models
 * Returns all available models from the model catalog
 */
async function handleGetModels(
  providers: GatewayProviderConfig[]
): Promise<Response> {
  try {
    const providerNames = new Set(providers.map(p => p.name).filter(Boolean));
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
    return createErrorResponse(
      "internal_error",
      error instanceof Error ? error.message : "Failed to retrieve models",
      500
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

    const client = request.headers.get("x-cc-switch-client") || "default";
    const sessionId = request.headers.get("x-ccr-session-id") || "";

    const modelEntry = findModelCatalogEntry(model);
    if (!modelEntry) {
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

    const sessionManager = getSessionModelBindingManager();
    const sessionKey = sessionManager.getSessionKey(client, sessionId);
    const previousModel = sessionManager.getCurrentModel(sessionKey);
    
    sessionManager.setCurrentModel(sessionKey, modelEntry.id);

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

// ============================================================================
// V2 API - Budget Management
// ============================================================================

/**
 * GET /v2/ccr/budget/state
 * Get budget state for current session
 */
async function handleGetBudgetState(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = url.searchParams.get("model");
    const sessionId = request.headers.get("x-ccr-session-id") || "";
    const client = request.headers.get("x-cc-switch-client") || "default";

    if (!model) {
      return createErrorResponse("invalid_request", "Missing 'model' parameter", 400);
    }

    const budgetTracker = getBudgetTracker();
    const sessionKey = `${client}:${sessionId}`;
    const state = budgetTracker.getBudgetState(sessionKey, model);

    return new Response(JSON.stringify(state), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return createErrorResponse(
      "internal_error",
      error instanceof Error ? error.message : "Failed to get budget state",
      500
    );
  }
}

/**
 * POST /v2/ccr/budget/confirm
 * Agent responds to budget confirmation request
 */
async function handleBudgetConfirmation(request: Request): Promise<Response> {
  try {
    const body = await request.json() as BudgetConfirmationResponse & { 
      model?: string;
    };
    const sessionId = request.headers.get("x-ccr-session-id") || "";
    const client = request.headers.get("x-cc-switch-client") || "default";
    const sessionKey = `${client}:${sessionId}`;

    const budgetTracker = getBudgetTracker();

    if (body.action === 'continue') {
      if (body.model) {
        budgetTracker.clearPendingConfirmation(sessionKey, body.model);
      }
      return new Response(
        JSON.stringify({ success: true, message: "Continuing with current model" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (body.action === 'switch' && body.targetModel) {
      if (body.model) {
        budgetTracker.clearPendingConfirmation(sessionKey, body.model);
      }
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Switching model",
          targetModel: body.targetModel 
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (body.action === 'stop') {
      return new Response(
        JSON.stringify({ success: true, message: "Stopping current task" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return createErrorResponse("invalid_request", "Invalid action", 400);
  } catch (error) {
    return createErrorResponse(
      "internal_error",
      error instanceof Error ? error.message : "Failed to process confirmation",
      500
    );
  }
}

/**
 * POST /v2/ccr/budget/reset
 * Reset budget tracking for a session
 */
async function handleBudgetReset(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { model?: string };
    const sessionId = request.headers.get("x-ccr-session-id") || "";
    const client = request.headers.get("x-cc-switch-client") || "default";
    const sessionKey = `${client}:${sessionId}`;

    const budgetTracker = getBudgetTracker();
    budgetTracker.resetUsage(sessionKey, body.model);

    return new Response(
      JSON.stringify({ success: true, message: "Budget reset successfully" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return createErrorResponse(
      "internal_error",
      error instanceof Error ? error.message : "Failed to reset budget",
      500
    );
  }
}

// ============================================================================
// V2 API - Orchestra Management
// ============================================================================

/**
 * GET /v2/ccr/orchestra/config
 * Get current orchestra configuration
 */
async function handleGetOrchestraConfig(): Promise<Response> {
  try {
    const engine = getOrchestraEngine();
    const config: OrchestraConfig = {
      enabled: engine['config'].enabled,
      defaultOrchestratorModel: engine['config'].defaultOrchestratorModel,
      roles: engine.getRoles(),
    };

    return new Response(JSON.stringify(config), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return createErrorResponse(
      "internal_error",
      error instanceof Error ? error.message : "Failed to get orchestra config",
      500
    );
  }
}

/**
 * POST /v2/ccr/orchestra/config
 * Update orchestra configuration
 */
async function handleUpdateOrchestraConfig(request: Request): Promise<Response> {
  try {
    const config = await request.json() as OrchestraConfig;

    if (typeof config.enabled !== 'boolean') {
      return createErrorResponse("invalid_request", "Missing or invalid 'enabled' field", 400);
    }

    const engine = getOrchestraEngine();
    engine.updateConfig(config);

    return new Response(
      JSON.stringify({ success: true, message: "Orchestra config updated" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return createErrorResponse(
      "internal_error",
      error instanceof Error ? error.message : "Failed to update orchestra config",
      500
    );
  }
}

/**
 * GET /v2/ccr/orchestra/roles
 * Get all roles
 */
async function handleGetRoles(): Promise<Response> {
  try {
    const engine = getOrchestraEngine();
    const roles = engine.getRoles();

    return new Response(JSON.stringify({ roles }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return createErrorResponse(
      "internal_error",
      error instanceof Error ? error.message : "Failed to get roles",
      500
    );
  }
}

/**
 * POST /v2/ccr/orchestra/roles
 * Add or update a role
 */
async function handleUpsertRole(request: Request): Promise<Response> {
  try {
    const role = await request.json() as Role;

    if (!role.name || !role.model) {
      return createErrorResponse(
        "invalid_request",
        "Missing required fields: name, model",
        400
      );
    }

    const engine = getOrchestraEngine();
    engine.upsertRole(role);

    return new Response(
      JSON.stringify({ success: true, message: `Role '${role.name}' saved` }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return createErrorResponse(
      "internal_error",
      error instanceof Error ? error.message : "Failed to save role",
      500
    );
  }
}

/**
 * DELETE /v2/ccr/orchestra/roles/:name
 * Delete a role
 */
async function handleDeleteRole(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const roleName = decodeURIComponent(pathParts[pathParts.length - 1]);

    const engine = getOrchestraEngine();
    const deleted = engine.removeRole(roleName);

    if (deleted) {
      return new Response(
        JSON.stringify({ success: true, message: `Role '${roleName}' deleted` }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } else {
      return createErrorResponse("not_found", `Role '${roleName}' not found`, 404);
    }
  } catch (error) {
    return createErrorResponse(
      "internal_error",
      error instanceof Error ? error.message : "Failed to delete role",
      500
    );
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get available models from catalog for given providers
 */
function getAvailableModels(providerNames: Set<string>): AvailableModel[] {
  const models: AvailableModel[] = [];
  
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

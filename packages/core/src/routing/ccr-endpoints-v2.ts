/**
 * CCR API v2 - Budget tracking and Orchestra management
 */

import type { GatewayProviderConfig } from "@ccr/core/contracts/app";
import { getBudgetTracker } from "@ccr/core/gateway/features/budget-tracker";
import { getOrchestraEngine } from "@ccr/core/gateway/features/orchestra-engine-v2";
import type { 
  BudgetConfirmationResponse,
} from "@ccr/core/models/budget-config";
import type { Role, OrchestraConfig } from "@ccr/core/models/orchestra-config";

/**
 * Check if the path is a CCR v2 endpoint
 */
export function isCcrV2Endpoint(path: string): boolean {
  const normalized = path.toLowerCase();
  return normalized.startsWith("/v2/ccr/") || normalized.startsWith("/ccr/v2/");
}

/**
 * Route CCR v2 requests
 */
export async function handleCcrV2Endpoint(
  request: Request,
  _providers: GatewayProviderConfig[]
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.toLowerCase();
  const method = request.method.toUpperCase();

  // Budget endpoints
  if (path.match(/\/(v2\/)?ccr\/(v2\/)?budget\/state/) && method === "GET") {
    return handleGetBudgetState(request);
  }

  if (path.match(/\/(v2\/)?ccr\/(v2\/)?budget\/confirm/) && method === "POST") {
    return handleBudgetConfirmation(request);
  }

  if (path.match(/\/(v2\/)?ccr\/(v2\/)?budget\/reset/) && method === "POST") {
    return handleBudgetReset(request);
  }

  // Orchestra endpoints
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
      // Clear pending confirmation and continue with current model
      if (body.model) {
        budgetTracker.clearPendingConfirmation(sessionKey, body.model);
      }
      return new Response(
        JSON.stringify({ success: true, message: "Continuing with current model" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (body.action === 'switch' && body.targetModel) {
      // Switch to target model and clear confirmation
      if (body.model) {
        budgetTracker.clearPendingConfirmation(sessionKey, body.model);
      }
      // Model switching will be handled by the main switch-model endpoint
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

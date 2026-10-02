/**
 * Model switching feature - applies session-based model bindings
 */

import { getSessionModelBindingManager } from "@ccr/core/gateway/session-model-binding";
import type { RequestRouteTraceChange } from "@ccr/core/contracts/app";

export interface ModelSwitchingResult {
  bodyModified: boolean;
  originalModel?: string;
  boundModel?: string;
  body?: string;
  changes: RequestRouteTraceChange[];
}

/**
 * Apply session model binding if one exists
 * Checks for x-cc-switch-client and x-ccr-session-id headers
 * and overrides the model in the request body if a binding exists
 */
export function applySessionModelBinding(
  headers: Record<string, string | string[] | undefined>,
  requestBody: string
): ModelSwitchingResult {
  const changes: RequestRouteTraceChange[] = [];
  
  // Extract session info from headers
  const client = getHeaderValue(headers["x-cc-switch-client"]) || "default";
  const sessionId = getHeaderValue(headers["x-ccr-session-id"]) || "";
  
  // Get session manager and check for binding
  const sessionManager = getSessionModelBindingManager();
  const sessionKey = sessionManager.getSessionKey(client, sessionId);
  const boundModel = sessionManager.getCurrentModel(sessionKey);
  
  if (!boundModel) {
    // No binding, return original
    return { bodyModified: false, changes };
  }
  
  // Parse request body to check current model
  let bodyObj: any;
  try {
    bodyObj = JSON.parse(requestBody);
  } catch {
    // Invalid JSON, can't apply binding
    return { bodyModified: false, changes };
  }
  
  const originalModel = bodyObj.model;
  
  // Apply the binding
  bodyObj.model = boundModel;
  const modifiedBody = JSON.stringify(bodyObj);
  
  // Track the change
  if (originalModel !== boundModel) {
    changes.push({
      before: originalModel,
      after: boundModel,
      operation: originalModel ? "replace" : "add",
      path: "/body/model",
      scope: "body",
    });
  }
  
  return {
    bodyModified: true,
    originalModel,
    boundModel,
    body: modifiedBody,
    changes,
  };
}

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return value[0];
  return undefined;
}

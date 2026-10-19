/**
 * Model control types for CCR model switching and orchestration
 */

import type { ModelCatalogEntry } from "@ccr/core/gateway/model-catalog";
import type { BudgetState, BudgetConfirmationRequest, BudgetConfirmationResponse } from "./budget-config";
import type { ReasoningEffortLevel } from "./reasoning-config";

// Model switching request/response types

export interface ModelSwitchRequest {
  sessionKey: string;
  targetModel: string;
  reason: string;
}

export interface BudgetConfirmRequest {
  action: "continue" | "switch" | "stop";
  sessionKey: string;
  model: string;
  targetModel?: string;
  reason?: string;
}

export interface ReasoningEffortRequest {
  sessionKey: string;
  /** A level such as `high`, or `reset` to inherit the configured default. */
  effort: ReasoningEffortLevel | "reset" | string;
  reason?: string;
}

export interface ReasoningEffortResponse {
  success: boolean;
  sessionKey: string;
  effort: ReasoningEffortLevel;
  previousEffort?: ReasoningEffortLevel;
  levels: readonly ReasoningEffortLevel[];
}

export interface ModelSwitchSuccessResponse {
  success: true;
  previousModel?: string;
  currentModel: string;
  budgetState: BudgetState;
}

export interface ModelSwitchErrorResponse {
  success: false;
  error: string;
  availableModels: ModelInfo[];
}

export type ModelSwitchResponse = ModelSwitchSuccessResponse | ModelSwitchErrorResponse;

// Model info types

export interface ModelInfo {
  id: string;
  selector?: string;
  displayName: string;
  provider?: string;
  capabilities?: Record<string, unknown>;
  limits?: {
    contextTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    maxTokens?: number;
  };
}

export interface ModelsListResponse {
  models: ModelInfo[];
}

// Budget query types

export interface BudgetQueryResponse extends BudgetState {
  sessionKey: string;
}

// Conversion helpers

export function modelCatalogEntryToInfo(entry: ModelCatalogEntry): ModelInfo {
  return {
    id: entry.id,
    displayName: entry.displayName || entry.id,
    provider: entry.providers?.[0],
    capabilities: entry.capabilities,
    limits: entry.limits
      ? {
          contextTokens: entry.limits.contextTokens,
          inputTokens: entry.limits.inputTokens,
          outputTokens: entry.limits.outputTokens,
          maxTokens: entry.limits.maxTokens,
        }
      : undefined,
  };
}

// Export budget types for convenience
export type { BudgetState, BudgetConfirmationRequest, BudgetConfirmationResponse };

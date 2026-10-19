/**
 * Budget tracking and enforcement for model usage
 */

import type {
  ModelBudgetConfig,
  BudgetState,
  ModelUsage,
  BudgetConfirmationRequest,
} from "@ccr/core/models/budget-config";

export class BudgetTracker {
  private usageMap = new Map<string, ModelUsage>();
  private budgetConfig: ModelBudgetConfig;
  private pendingConfirmations = new Map<string, {
    request: BudgetConfirmationRequest;
    timestamp: number;
  }>();
  private overBudgetAllowances = new Set<string>();

  constructor(config: ModelBudgetConfig) {
    this.budgetConfig = config;
  }

  /**
   * Update configuration
   */
  updateConfig(config: ModelBudgetConfig): void {
    this.budgetConfig = config;
  }

  /**
   * Record token usage for a session and model
   */
  recordUsage(
    sessionKey: string,
    model: string,
    inputTokens: number,
    outputTokens: number
  ): void {
    const key = `${sessionKey}:${model}`;
    const existing = this.usageMap.get(key);

    if (existing) {
      existing.inputTokens += inputTokens;
      existing.outputTokens += outputTokens;
      existing.totalTokens += inputTokens + outputTokens;
      existing.requestCount += 1;
      existing.lastUpdated = new Date();
    } else {
      this.usageMap.set(key, {
        sessionKey,
        model,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        requestCount: 1,
        lastUpdated: new Date(),
      });
    }
  }

  /**
   * Get budget state for a session and model
   */
  getBudgetState(sessionKey: string, model?: string): BudgetState {
    const resolvedModel = model ?? this.getCurrentModel(sessionKey) ?? "unknown";
    const key = `${sessionKey}:${resolvedModel}`;
    const usage = this.usageMap.get(key);
    const used = usage?.totalTokens || 0;

    // Get budget for this specific model or use default
    const modelBudget = this.budgetConfig.models[resolvedModel];
    const budget = modelBudget?.budget || this.budgetConfig.defaultBudget;

    return {
      model: resolvedModel,
      budget,
      used,
      remaining: Math.max(0, budget - used),
      percentage: budget > 0 ? (used / budget) * 100 : 0,
    };
  }

  getModelBudget(model: string): number {
    return this.budgetConfig.models[model]?.budget ?? this.budgetConfig.defaultBudget;
  }

  isBudgetExceeded(sessionKey: string, model?: string): boolean {
    const state = this.getBudgetState(sessionKey, model);
    return state.model !== "unknown" && state.used >= state.budget;
  }

  /**
   * Check if budget is exceeded and confirmation is needed
   */
  needsConfirmation(sessionKey: string, model: string): boolean {
    const state = this.getBudgetState(sessionKey, model);
    const modelBudget = this.budgetConfig.models[model];
    const threshold = modelBudget?.warningThreshold || this.budgetConfig.warningThreshold;

    return state.percentage >= threshold;
  }

  /**
   * Create a pending confirmation request
   */
  createConfirmationRequest(
    sessionKey: string,
    model: string,
    taskContext?: string
  ): BudgetConfirmationRequest {
    const state = this.getBudgetState(sessionKey, model);
    const request: BudgetConfirmationRequest = {
      model,
      currentUsage: state.used,
      budgetLimit: state.budget,
      taskContext,
    };

    const key = `${sessionKey}:${model}`;
    this.pendingConfirmations.set(key, {
      request,
      timestamp: Date.now(),
    });

    return request;
  }

  /**
   * Check if there's a pending confirmation
   */
  hasPendingConfirmation(sessionKey: string, model: string): boolean {
    const key = `${sessionKey}:${model}`;
    const pending = this.pendingConfirmations.get(key);
    
    if (!pending) return false;

    // Expire confirmations after 5 minutes
    const age = Date.now() - pending.timestamp;
    if (age > 5 * 60 * 1000) {
      this.pendingConfirmations.delete(key);
      return false;
    }

    return true;
  }

  isOverBudgetAllowed(sessionKey: string, model: string): boolean {
    return this.overBudgetAllowances.has(`${sessionKey}:${model}`);
  }

  allowOverBudget(sessionKey: string, model: string): void {
    this.overBudgetAllowances.add(`${sessionKey}:${model}`);
  }

  /**
   * Clear pending confirmation
   */
  clearPendingConfirmation(sessionKey: string, model: string): void {
    const key = `${sessionKey}:${model}`;
    this.pendingConfirmations.delete(key);
  }

  /**
   * Get usage for a session across all models
   */
  getSessionUsage(sessionKey: string): ModelUsage[] {
    const result: ModelUsage[] = [];
    for (const [_key, usage] of this.usageMap) {
      if (usage.sessionKey === sessionKey) {
        result.push(usage);
      }
    }
    return result;
  }

  getCurrentModel(sessionKey: string): string | undefined {
    return this.getSessionUsage(sessionKey)
      .sort((left, right) => right.lastUpdated.getTime() - left.lastUpdated.getTime())[0]?.model;
  }

  /**
   * Reset usage for a session and model
   */
  resetUsage(sessionKey: string, model?: string): void {
    if (model) {
      const key = `${sessionKey}:${model}`;
      this.usageMap.delete(key);
      this.overBudgetAllowances.delete(key);
    } else {
      // Reset all models for this session
      for (const key of this.usageMap.keys()) {
        if (key.startsWith(`${sessionKey}:`)) {
          this.usageMap.delete(key);
          this.overBudgetAllowances.delete(key);
        }
      }
    }
  }

  /**
   * Clean up old entries (older than 24 hours)
   */
  cleanupOldEntries(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [key, usage] of this.usageMap) {
      const age = now - usage.lastUpdated.getTime();
      if (age > maxAge) {
        this.usageMap.delete(key);
      }
    }
  }
}

// Global instance
let globalBudgetTracker: BudgetTracker | null = null;

/**
 * Get or create the global budget tracker
 */
export function getBudgetTracker(): BudgetTracker {
  if (!globalBudgetTracker) {
    // Default configuration
    globalBudgetTracker = new BudgetTracker({
      defaultBudget: 1000000, // 1M tokens
      warningThreshold: 90, // 90%
      models: {},
    });
  }
  return globalBudgetTracker;
}

/**
 * Initialize budget tracker with configuration
 */
export function initializeBudgetTracker(config: ModelBudgetConfig): void {
  globalBudgetTracker = new BudgetTracker(config);
}

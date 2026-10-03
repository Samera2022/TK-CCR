/**
 * Budget tracker for model usage monitoring
 */

import type {
  ModelBudgetConfig,
  BudgetState,
  ModelUsage,
  BudgetConfirmationRequest,
} from "@ccr/core/models/budget-config";

export class BudgetTracker {
  private config: ModelBudgetConfig;
  private usage = new Map<string, ModelUsage>();

  constructor(config: ModelBudgetConfig) {
    this.config = config;
  }

  /**
   * Update configuration
   */
  updateConfig(config: ModelBudgetConfig): void {
    this.config = config;
  }

  /**
   * Get budget for a specific model
   */
  getModelBudget(model: string): number {
    const specificBudget = this.config.models[model];
    return specificBudget?.budget ?? this.config.defaultBudget;
  }

  /**
   * Get warning threshold for a specific model
   */
  getWarningThreshold(model: string): number {
    const specificBudget = this.config.models[model];
    return specificBudget?.warningThreshold ?? this.config.warningThreshold;
  }

  /**
   * Record token usage for a session
   */
  recordUsage(sessionKey: string, model: string, inputTokens: number, outputTokens: number): void {
    const existing = this.usage.get(sessionKey);
    const totalTokens = inputTokens + outputTokens;

    if (existing && existing.model === model) {
      existing.inputTokens += inputTokens;
      existing.outputTokens += outputTokens;
      existing.totalTokens += totalTokens;
      existing.requestCount += 1;
      existing.lastUpdated = new Date();
    } else {
      // Model changed or new session
      this.usage.set(sessionKey, {
        sessionKey,
        model,
        inputTokens,
        outputTokens,
        totalTokens,
        requestCount: 1,
        lastUpdated: new Date(),
      });
    }
  }

  /**
   * Get current usage for a session
   */
  getUsage(sessionKey: string): ModelUsage | undefined {
    return this.usage.get(sessionKey);
  }

  /**
   * Get budget state for a session
   */
  getBudgetState(sessionKey: string): BudgetState | undefined {
    const usage = this.usage.get(sessionKey);
    if (!usage) {
      return undefined;
    }

    const budget = this.getModelBudget(usage.model);
    const used = usage.totalTokens;
    const remaining = Math.max(0, budget - used);
    const percentage = budget > 0 ? (used / budget) * 100 : 0;

    return {
      model: usage.model,
      budget,
      used,
      remaining,
      percentage,
    };
  }

  /**
   * Check if budget is exceeded
   */
  isBudgetExceeded(sessionKey: string): boolean {
    const state = this.getBudgetState(sessionKey);
    if (!state) {
      return false;
    }
    return state.used >= state.budget;
  }

  /**
   * Check if warning threshold is reached
   */
  isWarningThresholdReached(sessionKey: string): boolean {
    const usage = this.usage.get(sessionKey);
    if (!usage) {
      return false;
    }

    const state = this.getBudgetState(sessionKey);
    if (!state) {
      return false;
    }

    const threshold = this.getWarningThreshold(usage.model);
    return state.percentage >= threshold * 100;
  }

  /**
   * Reset usage for a session (e.g., when model switches)
   */
  resetUsage(sessionKey: string, newModel?: string): void {
    if (newModel) {
      this.usage.set(sessionKey, {
        sessionKey,
        model: newModel,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        requestCount: 0,
        lastUpdated: new Date(),
      });
    } else {
      this.usage.delete(sessionKey);
    }
  }

  /**
   * Create a budget confirmation request
   */
  createConfirmationRequest(
    sessionKey: string,
    taskContext?: string
  ): BudgetConfirmationRequest | undefined {
    const usage = this.usage.get(sessionKey);
    if (!usage) {
      return undefined;
    }

    const budget = this.getModelBudget(usage.model);

    return {
      model: usage.model,
      currentUsage: usage.totalTokens,
      budgetLimit: budget,
      taskContext,
    };
  }

  /**
   * Clear old usage records (older than maxAge in milliseconds)
   */
  clearOldUsage(maxAge: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleared = 0;

    for (const [key, usage] of this.usage.entries()) {
      if (now - usage.lastUpdated.getTime() > maxAge) {
        this.usage.delete(key);
        cleared++;
      }
    }

    return cleared;
  }

  /**
   * Get all usage records (for debugging)
   */
  getAllUsage(): ModelUsage[] {
    return Array.from(this.usage.values());
  }
}

// Singleton instance
let instance: BudgetTracker | undefined;

export function getBudgetTracker(config?: ModelBudgetConfig): BudgetTracker {
  if (!instance && config) {
    instance = new BudgetTracker(config);
  } else if (!instance) {
    // Default config
    instance = new BudgetTracker({
      defaultBudget: 1_000_000,
      warningThreshold: 0.8,
      models: {},
    });
  } else if (config) {
    instance.updateConfig(config);
  }
  return instance;
}

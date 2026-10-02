/**
 * Budget tracking for model usage
 */

import type { ModelBudgetConfig, ModelUsage, BudgetState } from "@ccr/core/models/budget-config";

export class BudgetTracker {
  private usage = new Map<string, ModelUsage>();
  private config: ModelBudgetConfig;

  constructor(config: ModelBudgetConfig) {
    this.config = config;
  }

  /**
   * Record token usage for a model
   */
  recordUsage(
    sessionKey: string,
    model: string,
    inputTokens: number,
    outputTokens: number
  ): void {
    const key = this.getUsageKey(sessionKey, model);
    const existing = this.usage.get(key);

    if (existing) {
      existing.inputTokens += inputTokens;
      existing.outputTokens += outputTokens;
      existing.totalTokens += inputTokens + outputTokens;
      existing.requestCount += 1;
      existing.lastUpdated = new Date();
    } else {
      this.usage.set(key, {
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
   * Get budget state for a session/model
   */
  getBudgetState(sessionKey: string, model: string): BudgetState | undefined {
    const key = this.getUsageKey(sessionKey, model);
    const usage = this.usage.get(key);
    const budget = this.getBudgetLimit(model);

    if (!usage) {
      return {
        model,
        budget,
        used: 0,
        remaining: budget,
        percentage: 0,
      };
    }

    return {
      model,
      budget,
      used: usage.totalTokens,
      remaining: Math.max(0, budget - usage.totalTokens),
      percentage: (usage.totalTokens / budget) * 100,
    };
  }

  /**
   * Check if usage is over budget
   */
  isOverBudget(sessionKey: string, model: string): boolean {
    const state = this.getBudgetState(sessionKey, model);
    return state ? state.used > state.budget : false;
  }

  /**
   * Reset budget for a session/model
   */
  resetBudget(sessionKey: string, model: string): void {
    const key = this.getUsageKey(sessionKey, model);
    this.usage.delete(key);
  }

  /**
   * Extend budget temporarily
   */
  extendBudget(_sessionKey: string, model: string, additional: number): void {
    // For temporary extension, we modify the config for this session
    // In a production system, this would be tracked separately
    const modelConfig = this.config.models[model];
    if (modelConfig) {
      modelConfig.budget += additional;
    }
  }

  /**
   * Get budget limit for a model
   */
  private getBudgetLimit(model: string): number {
    const modelConfig = this.config.models[model];
    return modelConfig?.budget ?? this.config.defaultBudget;
  }

  /**
   * Generate usage key
   */
  private getUsageKey(sessionKey: string, model: string): string {
    return `${sessionKey}:${model}`;
  }

  /**
   * Clear expired budgets
   */
  clearExpiredBudgets(maxAge: number = 24 * 60 * 60 * 1000): number {
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
}

// Singleton instance
let instance: BudgetTracker | undefined;

export function getBudgetTracker(config?: ModelBudgetConfig): BudgetTracker {
  if (!instance && config) {
    instance = new BudgetTracker(config);
  }
  if (!instance) {
    // Default config
    instance = new BudgetTracker({
      defaultBudget: 100000,
      warningThreshold: 0.8,
      models: {},
    });
  }
  return instance;
}

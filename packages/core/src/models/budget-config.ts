/**
 * Budget configuration and tracking types
 */

export interface ModelBudgetConfig {
  defaultBudget: number
  warningThreshold: number
  models: Record<string, ModelSpecificBudget>
}

export interface ModelSpecificBudget {
  budget: number
  warningThreshold?: number
}

export interface BudgetState {
  model: string
  budget: number
  used: number
  remaining: number
  percentage: number
}

export interface ModelUsage {
  sessionKey: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  requestCount: number
  lastUpdated: Date
}

export interface BudgetConfirmationRequest {
  model: string
  currentUsage: number
  budgetLimit: number
  taskContext?: string
}

export type BudgetConfirmationResponse = 
  | { action: 'continue' }
  | { action: 'switch'; targetModel: string }
  | { action: 'stop' }

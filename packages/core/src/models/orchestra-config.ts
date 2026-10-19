/**
 * Orchestra mode configuration types
 */

export interface OrchestraConfig {
  enabled: boolean
  defaultOrchestratorModel: string
  roles: Role[]
}

export const ORCHESTRA_MODEL_ID = "orchestra";

export interface Role {
  name: string
  model: string
  systemPrompt: string
  triggers: string[]
  budget?: number
}

export interface RoleSelection {
  role: Role
  confidence: number
  reason: string
}

export interface OrchestraResult {
  selectedRole: Role
  model: string
  systemPrompt: string
  confidence?: number
  reason?: string
}

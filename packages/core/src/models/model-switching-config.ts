/**
 * Model switching configuration and data types
 */

export interface ModelSwitchingConfig {
  enabled: boolean;
}

export interface AvailableModel {
  id: string;
  displayName: string;
  provider: string;
  contextTokens?: number;
  capabilities?: string[];
}

export interface SwitchModelRequest {
  model: string;
  reason: string;
}

export interface SwitchModelResponse {
  success: boolean;
  model?: string;
  previousModel?: string;
  error?: string;
  message?: string;
  availableModels?: AvailableModel[];
}

export interface SessionModelBinding {
  sessionKey: string;
  modelId: string;
  timestamp: Date;
}

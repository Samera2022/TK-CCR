/**
 * Orchestra Engine V2 - Automatic role-based model selection
 * Supports LLM-based task classification and role selection
 */

import type { 
  OrchestraConfig, 
  Role, 
  RoleSelection, 
  OrchestraResult 
} from "@ccr/core/models/orchestra-config";
import { getSessionModelBindingManager } from "@ccr/core/gateway/session-model-binding";

export interface OrchestraClassificationRequest {
  userMessage: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  availableRoles: Role[];
  orchestratorModel: string;
}

export interface OrchestraClassificationResponse {
  selectedRole: string;
  confidence: number;
  reasoning: string;
}

export class OrchestraEngineV2 {
  constructor(
    private config: OrchestraConfig,
    private classifierFn?: (request: OrchestraClassificationRequest) => Promise<OrchestraClassificationResponse>
  ) {}

  /**
   * Handle orchestra-enabled request
   * Classifies task and selects appropriate role
   */
  async handleRequest(
    sessionKey: string,
    userMessage: string,
    originalModel: string,
    conversationHistory?: Array<{ role: string; content: string }>
  ): Promise<OrchestraResult> {
    if (!this.config.enabled || this.config.roles.length === 0) {
      // Orchestra disabled, return original model
      return {
        selectedRole: {
          name: 'default',
          model: originalModel,
          systemPrompt: '',
          triggers: [],
        },
        model: originalModel,
        systemPrompt: '',
      };
    }

    // Classify task and select role
    const selection = await this.classifyTask(userMessage, conversationHistory);
    
    // Update session binding
    const sessionManager = getSessionModelBindingManager();
    sessionManager.setCurrentModel(sessionKey, selection.role.model);

    console.log(`[Orchestra] Selected role: ${selection.role.name}, model: ${selection.role.model}, confidence: ${selection.confidence.toFixed(2)}, reason: ${selection.reason}`);

    return {
      selectedRole: selection.role,
      model: selection.role.model,
      systemPrompt: selection.role.systemPrompt,
    };
  }

  /**
   * Classify task and select appropriate role
   */
  private async classifyTask(
    userMessage: string,
    conversationHistory?: Array<{ role: string; content: string }>
  ): Promise<RoleSelection> {
    // If custom classifier is provided, use it
    if (this.classifierFn) {
      try {
        const response = await this.classifierFn({
          userMessage,
          conversationHistory,
          availableRoles: this.config.roles,
          orchestratorModel: this.config.defaultOrchestratorModel,
        });

        const role = this.config.roles.find(r => r.name === response.selectedRole);
        if (role) {
          return {
            role,
            confidence: response.confidence,
            reason: response.reasoning,
          };
        }
      } catch (error) {
        console.error('[Orchestra] Classification failed:', error);
      }
    }

    // Fallback to keyword-based classification
    return this.keywordBasedClassification(userMessage);
  }

  /**
   * Keyword-based classification fallback
   */
  private keywordBasedClassification(userMessage: string): RoleSelection {
    const messageLower = userMessage.toLowerCase();
    
    // Try to match triggers
    for (const role of this.config.roles) {
      for (const trigger of role.triggers) {
        if (messageLower.includes(trigger.toLowerCase())) {
          return {
            role,
            confidence: 0.8,
            reason: `Matched trigger keyword: "${trigger}"`,
          };
        }
      }
    }

    // Default to first role
    return {
      role: this.config.roles[0],
      confidence: 0.5,
      reason: 'No specific trigger matched, using default role',
    };
  }

  /**
   * Get current role for a session
   */
  getCurrentRole(sessionKey: string): Role | null {
    const sessionManager = getSessionModelBindingManager();
    const currentModel = sessionManager.getCurrentModel(sessionKey);
    
    if (!currentModel) return null;

    return this.config.roles.find(r => r.model === currentModel) || null;
  }

  /**
   * Update orchestra configuration
   */
  updateConfig(config: OrchestraConfig): void {
    this.config = config;
  }

  /**
   * Get all available roles
   */
  getRoles(): Role[] {
    return [...this.config.roles];
  }

  /**
   * Add or update a role
   */
  upsertRole(role: Role): void {
    const index = this.config.roles.findIndex(r => r.name === role.name);
    if (index >= 0) {
      this.config.roles[index] = role;
    } else {
      this.config.roles.push(role);
    }
  }

  /**
   * Remove a role
   */
  removeRole(roleName: string): boolean {
    const index = this.config.roles.findIndex(r => r.name === roleName);
    if (index >= 0) {
      this.config.roles.splice(index, 1);
      return true;
    }
    return false;
  }
}

// Global instance
let globalOrchestraEngine: OrchestraEngineV2 | null = null;

/**
 * Get or create the global orchestra engine
 */
export function getOrchestraEngine(): OrchestraEngineV2 {
  if (!globalOrchestraEngine) {
    // Default configuration with orchestra disabled
    globalOrchestraEngine = new OrchestraEngineV2({
      enabled: false,
      defaultOrchestratorModel: 'anthropic/claude-sonnet-4.5',
      roles: [],
    });
  }
  return globalOrchestraEngine;
}

/**
 * Initialize orchestra engine with configuration
 */
export function initializeOrchestraEngine(
  config: OrchestraConfig,
  classifierFn?: (request: OrchestraClassificationRequest) => Promise<OrchestraClassificationResponse>
): void {
  globalOrchestraEngine = new OrchestraEngineV2(config, classifierFn);
}

/**
 * Build orchestrator system prompt for LLM classification
 */
export function buildOrchestratorPrompt(roles: Role[]): string {
  const roleDescriptions = roles.map((role, index) => {
    const triggers = role.triggers.length > 0 
      ? `\n  Triggers: ${role.triggers.join(', ')}`
      : '';
    return `${index + 1}. ${role.name}
  Model: ${role.model}
  Description: ${role.systemPrompt.substring(0, 200)}...${triggers}`;
  }).join('\n\n');

  return `You are a task orchestrator for a multi-model AI system. Your job is to analyze incoming user requests and select the most appropriate role (and corresponding model) to handle the task.

Available roles:
${roleDescriptions}

Instructions:
1. Carefully analyze the user's request and any conversation history
2. Consider the task type, complexity, required capabilities, and context
3. Select the most appropriate role based on:
   - Task alignment with role's purpose
   - Model capabilities (context size, reasoning, vision, etc.)
   - Budget constraints if specified
   - Trigger keyword matches
4. Respond with a JSON object containing:
   {
     "selectedRole": "role_name",
     "confidence": 0.0-1.0,
     "reasoning": "brief explanation of why this role was selected"
   }

Your response must be valid JSON and nothing else.`;
}

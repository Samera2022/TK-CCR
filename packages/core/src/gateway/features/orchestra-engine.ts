/**
 * Orchestra Engine - Automatic model selection based on task
 * TODO: Full implementation pending - requires LLM integration for task classification
 */

import type { OrchestraConfig, Role, RoleSelection, OrchestraResult } from "@ccr/core/models/orchestra-config";
import { getSessionModelBindingManager } from "@ccr/core/gateway/session-model-binding";

export class OrchestraEngine {
  constructor(
    private config: OrchestraConfig
  ) {}

  /**
   * Handle orchestra-enabled request
   * Classifies task and selects appropriate role
   */
  async handleRequest(
    sessionKey: string,
    userMessage: string,
    originalModel: string
  ): Promise<OrchestraResult> {
    if (!this.config.enabled || this.config.roles.length === 0) {
      // Orchestra disabled, use first available role or default
      const defaultRole = this.config.roles[0] || {
        name: 'default',
        model: originalModel,
        systemPrompt: '',
        triggers: [],
      };
      return {
        selectedRole: defaultRole,
        model: originalModel,
        systemPrompt: '',
      };
    }

    // Classify task and select role
    const selection = await this.classifyTask(userMessage);
    
    // Update session binding
    const sessionManager = getSessionModelBindingManager();
    sessionManager.setCurrentModel(sessionKey, selection.role.model);

    return {
      selectedRole: selection.role,
      model: selection.role.model,
      systemPrompt: selection.role.systemPrompt,
    };
  }

  /**
   * Classify task using orchestrator model
   * TODO: Implement actual LLM call to orchestrator
   */
  private async classifyTask(userMessage: string): Promise<RoleSelection> {
    // Simple keyword-based classification for now
    // In production, this would call the orchestrator LLM
    
    const messageLower = userMessage.toLowerCase();
    
    for (const role of this.config.roles) {
      for (const trigger of role.triggers) {
        if (messageLower.includes(trigger.toLowerCase())) {
          return {
            role,
            confidence: 0.8,
            reason: `Matched trigger: ${trigger}`,
          };
        }
      }
    }

    // Default to first role
    return {
      role: this.config.roles[0],
      confidence: 0.5,
      reason: 'Default role selection',
    };
  }
}

// Build orchestrator prompt for LLM
export function buildOrchestratorPrompt(roles: Role[]): string {
  const roleList = roles.map(role => 
    `- ${role.name}: ${role.systemPrompt.substring(0, 100)}...`
  ).join('\n');

  return `You are a task orchestrator for a multi-model AI system. Your job is to analyze
incoming requests and select the most appropriate role.

Available roles:
${roleList}

Instructions:
1. Analyze the user's request carefully
2. Identify the primary task type
3. Select the most appropriate role
4. Respond with ONLY the role name, nothing else`;
}

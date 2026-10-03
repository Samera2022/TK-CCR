/**
 * Orchestra service - manages role-based model selection
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { OrchestraConfig, Role, RoleSelection } from "@ccr/core/models/orchestra-config";
import { getSessionModelBindingManager } from "@ccr/core/gateway/session-model-binding";

export const ccrOrchestraPathPrefix = "/__ccr/orchestra/v1";

export type OrchestraRequestContext = {
  endpoint: string;
  path: string;
  readBody: (request: IncomingMessage) => Promise<Buffer>;
  request: IncomingMessage;
  response: ServerResponse;
  sendJson: (response: ServerResponse, statusCode: number, payload: unknown) => void;
};

interface RoleSelectionRequest {
  sessionKey: string;
  taskDescription: string;
  context?: Record<string, unknown>;
}

interface RoleSelectionResponse {
  selectedRole: Role;
  confidence: number;
  reason: string;
}

class OrchestraService {
  private config: OrchestraConfig = {
    enabled: false,
    defaultOrchestratorModel: "gpt-5.6-sol",
    roles: [],
  };

  updateConfig(config: OrchestraConfig): void {
    this.config = config;
  }

  getConfig(): OrchestraConfig {
    return this.config;
  }

  async handleRequest(context: OrchestraRequestContext): Promise<void> {
    const segments = orchestraPathSegments(context.path);
    const [root] = segments;

    if (segments.length === 0 || context.path === ccrOrchestraPathPrefix) {
      this.sendCapabilities(context);
      return;
    }

    if (root === "capabilities") {
      this.sendCapabilities(context);
      return;
    }

    if (root === "config" && context.request.method === "GET") {
      await this.handleGetConfig(context);
      return;
    }

    if (root === "select-role" && context.request.method === "POST") {
      await this.handleSelectRole(context);
      return;
    }

    context.sendJson(context.response, 404, {
      error: { message: "Orchestra endpoint not found." },
    });
  }

  private sendCapabilities(context: OrchestraRequestContext): void {
    context.sendJson(context.response, 200, {
      capabilities: {
        roleSelection: true,
        orchestration: true,
      },
      endpoints: {
        config: "GET /__ccr/orchestra/v1/config",
        selectRole: "POST /__ccr/orchestra/v1/select-role",
      },
    });
  }

  private async handleGetConfig(context: OrchestraRequestContext): Promise<void> {
    context.sendJson(context.response, 200, this.config);
  }

  private async handleSelectRole(context: OrchestraRequestContext): Promise<void> {
    let body: RoleSelectionRequest;
    try {
      const buffer = await context.readBody(context.request);
      body = JSON.parse(buffer.toString("utf-8"));
    } catch {
      context.sendJson(context.response, 400, {
        error: { message: "Invalid JSON body." },
      });
      return;
    }

    // Validate request
    if (!body.sessionKey || !body.taskDescription) {
      context.sendJson(context.response, 400, {
        error: { message: "Missing required fields: sessionKey, taskDescription." },
      });
      return;
    }

    // Check if orchestra is enabled
    if (!this.config.enabled) {
      context.sendJson(context.response, 400, {
        error: { message: "Orchestra mode is not enabled." },
      });
      return;
    }

    // Select role based on task description
    const selection = this.selectRole(body.taskDescription, body.context);
    
    if (!selection) {
      context.sendJson(context.response, 404, {
        error: { message: "No suitable role found for this task." },
      });
      return;
    }

    // Apply the role's model to the session
    const sessionManager = getSessionModelBindingManager();
    sessionManager.setCurrentModel(body.sessionKey, selection.role.model);

    const response: RoleSelectionResponse = {
      selectedRole: selection.role,
      confidence: selection.confidence,
      reason: selection.reason,
    };

    context.sendJson(context.response, 200, response);
  }

  /**
   * Select the most appropriate role based on task description
   * Uses a simple trigger-matching algorithm
   * In production, this could call the orchestrator model
   */
  private selectRole(
    taskDescription: string,
    context?: Record<string, unknown>
  ): RoleSelection | undefined {
    if (this.config.roles.length === 0) {
      return undefined;
    }

    const lowerTask = taskDescription.toLowerCase();
    const scores: Array<{ role: Role; score: number; matchedTriggers: string[] }> = [];

    // Score each role based on trigger matches
    for (const role of this.config.roles) {
      let score = 0;
      const matchedTriggers: string[] = [];

      for (const trigger of role.triggers) {
        const lowerTrigger = trigger.toLowerCase();
        if (lowerTask.includes(lowerTrigger)) {
          score += 1;
          matchedTriggers.push(trigger);
        }
      }

      // Boost score if context matches
      if (context && Object.keys(context).length > 0) {
        const contextStr = JSON.stringify(context).toLowerCase();
        for (const trigger of role.triggers) {
          if (contextStr.includes(trigger.toLowerCase())) {
            score += 0.5;
          }
        }
      }

      scores.push({ role, score, matchedTriggers });
    }

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    const bestMatch = scores[0];
    if (bestMatch.score === 0) {
      // No matches, return default role (first one)
      return {
        role: this.config.roles[0],
        confidence: 0.3,
        reason: "使用默认角色，因为没有找到明确的匹配触发词",
      };
    }

    // Calculate confidence based on score
    const maxPossibleScore = this.config.roles.reduce(
      (max, role) => Math.max(max, role.triggers.length),
      0
    );
    const confidence = Math.min(0.95, bestMatch.score / maxPossibleScore);

    return {
      role: bestMatch.role,
      confidence,
      reason: `匹配触发词: ${bestMatch.matchedTriggers.join(", ")}`,
    };
  }
}

function orchestraPathSegments(path: string): string[] {
  const withoutPrefix = path.startsWith(ccrOrchestraPathPrefix)
    ? path.slice(ccrOrchestraPathPrefix.length)
    : path;
  return withoutPrefix
    .split("/")
    .filter((s) => s.length > 0)
    .map((s) => decodeURIComponent(s));
}

// Singleton instance
let instance: OrchestraService | undefined;

export function getOrchestraService(config?: OrchestraConfig): OrchestraService {
  if (!instance) {
    instance = new OrchestraService();
  }
  if (config) {
    instance.updateConfig(config);
  }
  return instance;
}

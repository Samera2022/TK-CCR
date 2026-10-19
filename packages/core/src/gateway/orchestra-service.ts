/**
 * Orchestra service - manages role-based model selection
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { GatewayProviderConfig } from "@ccr/core/contracts/app";
import type { OrchestraConfig, Role } from "@ccr/core/models/orchestra-config";
import { getOrchestraEngine } from "@ccr/core/gateway/features/orchestra-engine-v2";

export const ccrOrchestraPathPrefix = "/__ccr/orchestra/v1";

export type OrchestraRequestContext = {
  endpoint: string;
  path: string;
  readBody: (request: IncomingMessage) => Promise<Buffer>;
  providers?: GatewayProviderConfig[];
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
    getOrchestraEngine().updateConfig(config);
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

    const result = await getOrchestraEngine().handleRequest(
      body.sessionKey,
      body.taskDescription,
      this.config.roles[0]?.model ?? this.config.defaultOrchestratorModel,
      body.context ? [{ role: "context", content: JSON.stringify(body.context) }] : undefined,
    );

    const providers = context.providers ?? [];
    const available = providers.length === 0 || providers.some((provider) =>
      provider.enabled !== false && provider.models?.some((model) =>
        model === result.model || model.split("/").pop() === result.model.split("/").pop()
      )
    );
    if (!available) {
      context.sendJson(context.response, 404, {
        error: "Selected role model is not available",
        availableModels: (context.providers ?? []).flatMap((provider) =>
          provider.enabled === false ? [] : (provider.models ?? []).map((model) => ({ id: model, displayName: model, provider: provider.name }))
        )
      });
      return;
    }

    const response: RoleSelectionResponse = {
      selectedRole: result.selectedRole,
      confidence: result.confidence ?? 0.5,
      reason: result.reason ?? "Selected by the configured Orchestra classifier or trigger fallback.",
    };

    context.sendJson(context.response, 200, response);
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

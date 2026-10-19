/**
 * Model control service - handles model switching and budget management
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { AppConfig, GatewayProviderConfig } from "@ccr/core/contracts/app";
import { findModelCatalogEntry } from "@ccr/core/gateway/model-catalog";
import { getSessionModelBindingManager } from "@ccr/core/gateway/session-model-binding";
import { getBudgetTracker } from "@ccr/core/gateway/features/budget-tracker";
import type {
  ModelSwitchRequest,
  ModelSwitchResponse,
  ModelsListResponse,
  BudgetQueryResponse,
  ModelInfo,
  BudgetConfirmRequest,
  ReasoningEffortRequest,
  ReasoningEffortResponse,
} from "@ccr/core/models/model-control-types";
import { modelCatalogEntryToInfo } from "@ccr/core/models/model-control-types";
import { ORCHESTRA_MODEL_ID } from "@ccr/core/models/orchestra-config";
import { modelRegistryForConfig } from "@ccr/core/routing/model-registry";
import { getSessionReasoningBindingManager } from "@ccr/core/gateway/session-reasoning-binding";
import { normalizeReasoningEffortLevel, REASONING_EFFORT_LEVELS } from "@ccr/core/models/reasoning-config";

export const ccrModelControlPathPrefix = "/__ccr/model-control/v1";

export type ModelControlRequestContext = {
  endpoint: string;
  path: string;
  providers?: GatewayProviderConfig[];
  virtualModelProfiles?: AppConfig["virtualModelProfiles"];
  orchestraEnabled?: boolean;
  defaultReasoningEffort?: string;
  readBody: (request: IncomingMessage) => Promise<Buffer>;
  request: IncomingMessage;
  response: ServerResponse;
  sendJson: (response: ServerResponse, statusCode: number, payload: unknown) => void;
};

class ModelControlService {
  async handleRequest(context: ModelControlRequestContext): Promise<void> {
    const segments = modelControlPathSegments(context.path);
    const [root, ...rest] = segments;

    if (segments.length === 0 || context.path === ccrModelControlPathPrefix) {
      this.sendCapabilities(context);
      return;
    }

    if (root === "capabilities") {
      this.sendCapabilities(context);
      return;
    }

    if (root === "switch" && context.request.method === "POST") {
      await this.handleSwitchModel(context);
      return;
    }

    if (root === "models" && context.request.method === "GET") {
      await this.handleListModels(context);
      return;
    }

    if (root === "budget" && rest.length === 1 && context.request.method === "GET") {
      await this.handleBudgetQuery(context, rest[0]);
      return;
    }

    if (root === "budget-confirm" && context.request.method === "POST") {
      await this.handleBudgetConfirm(context);
      return;
    }

    if (root === "reasoning" && rest.length === 1 && context.request.method === "GET") {
      this.handleReasoningQuery(context, rest[0]);
      return;
    }

    if (root === "reasoning" && rest.length === 0 && context.request.method === "POST") {
      await this.handleReasoningSet(context);
      return;
    }

    context.sendJson(context.response, 404, {
      error: { message: "Model control endpoint not found." },
    });
  }

  private sendCapabilities(context: ModelControlRequestContext): void {
    context.sendJson(context.response, 200, {
      capabilities: {
        modelSwitching: true,
        budgetTracking: true,
        orchestra: true,
        reasoningEffort: true,
      },
      endpoints: {
        switch: "POST /__ccr/model-control/v1/switch",
        models: "GET /__ccr/model-control/v1/models",
        budget: "GET /__ccr/model-control/v1/budget/:sessionKey",
        budgetConfirm: "POST /__ccr/model-control/v1/budget-confirm",
        reasoning: "GET /__ccr/model-control/v1/reasoning/:sessionKey",
        reasoningSet: "POST /__ccr/model-control/v1/reasoning",
      },
    });
  }

  private async handleSwitchModel(context: ModelControlRequestContext): Promise<void> {
    let body: ModelSwitchRequest;
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
    if (!body.sessionKey?.trim() || !body.targetModel?.trim() || !body.reason?.trim()) {
      context.sendJson(context.response, 400, {
        error: { message: "Missing required fields: sessionKey, targetModel, reason." },
      });
      return;
    }

    // Check if target model exists
    const targetEntry = body.targetModel === ORCHESTRA_MODEL_ID && !context.orchestraEnabled
      ? undefined
      : this.findAvailableModel(body.targetModel, context.providers ?? []);
    if (!targetEntry) {
      // Model not found, return available models
      const availableModels = this.getAvailableModels(context.providers);
      const response: ModelSwitchResponse = {
        success: false,
        error: "Model not found",
        availableModels,
      };
      context.sendJson(context.response, 404, response);
      return;
    }

    // Get session manager and current model
    const sessionManager = getSessionModelBindingManager();
    const previousModel = sessionManager.getCurrentModel(body.sessionKey);

    // Switch model
    const selectedModel = targetEntry?.selector ?? body.targetModel;
    sessionManager.setCurrentModel(body.sessionKey, selectedModel);

    // Reset budget for new model
    const budgetTracker = getBudgetTracker();
    budgetTracker.resetUsage(body.sessionKey, selectedModel);

    // Get budget state
    const budgetState = budgetTracker.getBudgetState(body.sessionKey, selectedModel);

    const response: ModelSwitchResponse = {
      success: true,
      previousModel,
      currentModel: selectedModel,
      budgetState,
    };

    context.sendJson(context.response, 200, response);
  }

  private async handleListModels(context: ModelControlRequestContext): Promise<void> {
    const models = this.getAvailableModels(context.providers);
    if (context.orchestraEnabled) {
      models.unshift({
        id: ORCHESTRA_MODEL_ID,
        displayName: "Orchestra",
        provider: "ccr",
        capabilities: { roleSelection: true, modelSwitching: true },
      });
    }
    const response: ModelsListResponse = { models };
    context.sendJson(context.response, 200, response);
  }

  private async handleBudgetQuery(context: ModelControlRequestContext, sessionKey: string): Promise<void> {
    const budgetTracker = getBudgetTracker();
    const model = getSessionModelBindingManager().getCurrentModel(sessionKey) ?? budgetTracker.getCurrentModel(sessionKey);
    const budgetState = model ? budgetTracker.getBudgetState(sessionKey, model) : undefined;

    if (!budgetState) {
      context.sendJson(context.response, 404, {
        error: { message: "No budget information found for this session." },
      });
      return;
    }

    const response: BudgetQueryResponse = {
      sessionKey,
      ...budgetState,
    };

    context.sendJson(context.response, 200, response);
  }

  private async handleBudgetConfirm(context: ModelControlRequestContext): Promise<void> {
    let body: BudgetConfirmRequest;
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
    if (!body.action || !body.sessionKey || !body.model || !["continue", "switch", "stop"].includes(body.action)) {
      context.sendJson(context.response, 400, {
        error: { message: "Invalid action. Must be 'continue', 'switch', or 'stop'. sessionKey and model are required." },
      });
      return;
    }

    if (body.action === "switch" && (!body.targetModel?.trim() || !body.reason?.trim())) {
      context.sendJson(context.response, 400, {
        error: { message: "targetModel and reason are required when action is 'switch'." },
      });
      return;
    }

    const sessionManager = getSessionModelBindingManager();
    const budgetTracker = getBudgetTracker();

    // Handle the confirmation
    if (body.action === "continue") {
      budgetTracker.clearPendingConfirmation(body.sessionKey, body.model);
      budgetTracker.allowOverBudget(body.sessionKey, body.model);
      context.sendJson(context.response, 200, {
        success: true,
        message: `Continuing with model ${body.model}`,
        action: "continue",
      });
    } else if (body.action === "switch") {
      budgetTracker.clearPendingConfirmation(body.sessionKey, body.model);
      // Validate target model exists
      const targetEntry = body.targetModel === ORCHESTRA_MODEL_ID && !context.orchestraEnabled
        ? undefined
        : this.findAvailableModel(body.targetModel!, context.providers ?? []);
      if (!targetEntry) {
        const availableModels = this.getAvailableModels(context.providers);
        context.sendJson(context.response, 404, {
          success: false,
          error: "Target model not found",
          availableModels,
        });
        return;
      }

      // Switch model and reset budget
      const selectedModel = targetEntry.selector ?? body.targetModel!;
      sessionManager.setCurrentModel(body.sessionKey, selectedModel);
      budgetTracker.resetUsage(body.sessionKey, selectedModel);

      context.sendJson(context.response, 200, {
        success: true,
        message: `Switched from ${body.model} to ${body.targetModel}`,
        action: "switch",
        newModel: selectedModel,
      });
    } else if (body.action === "stop") {
      budgetTracker.clearPendingConfirmation(body.sessionKey, body.model);
      context.sendJson(context.response, 200, {
        success: true,
        message: "Task execution stopped per user request",
        action: "stop",
        stopped: true,
      });
    }
  }

  private handleReasoningQuery(context: ModelControlRequestContext, sessionKey: string): void {
    const binding = getSessionReasoningBindingManager().getEffort(sessionKey);
    context.sendJson(context.response, 200, {
      effort: binding ?? normalizeReasoningEffortLevel(context.defaultReasoningEffort) ?? null,
      levels: REASONING_EFFORT_LEVELS,
      sessionKey,
      source: binding ? "session" : "default",
    });
  }

  private async handleReasoningSet(context: ModelControlRequestContext): Promise<void> {
    let body: ReasoningEffortRequest;
    try {
      const buffer = await context.readBody(context.request);
      body = JSON.parse(buffer.toString("utf-8"));
    } catch {
      context.sendJson(context.response, 400, {
        error: { message: "Invalid JSON body." },
      });
      return;
    }

    if (!body.sessionKey?.trim()) {
      context.sendJson(context.response, 400, {
        error: { message: "Missing required field: sessionKey." },
      });
      return;
    }

    const manager = getSessionReasoningBindingManager();
    const previousEffort = manager.getEffort(body.sessionKey);
    const resetRequested = typeof body.effort === "string" &&
      ["reset", "default", "inherit", "clear"].includes(body.effort.trim().toLowerCase());
    if (resetRequested) {
      manager.clearBinding(body.sessionKey);
      const resetResponse: ReasoningEffortResponse = {
        success: true,
        sessionKey: body.sessionKey,
        effort: normalizeReasoningEffortLevel(context.defaultReasoningEffort) ?? "medium",
        previousEffort,
        levels: REASONING_EFFORT_LEVELS,
      };
      context.sendJson(context.response, 200, resetResponse);
      return;
    }
    const effort = normalizeReasoningEffortLevel(body.effort);
    if (effort === undefined) {
      context.sendJson(context.response, 400, {
        error: {
          message: `Unsupported reasoning effort. Use one of: ${REASONING_EFFORT_LEVELS.join(", ")}, or "reset".`,
        },
        levels: REASONING_EFFORT_LEVELS,
      });
      return;
    }

    manager.setEffort(body.sessionKey, effort);

    const response: ReasoningEffortResponse = {
      success: true,
      sessionKey: body.sessionKey,
      effort,
      previousEffort,
      levels: REASONING_EFFORT_LEVELS,
    };
    context.sendJson(context.response, 200, response);
  }

  private getAvailableModels(providers: GatewayProviderConfig[] = []): ModelInfo[] {
    // The model catalog contains metadata, while provider config is the source
    // of truth for what this CCR instance can actually route to.
    const configuredModels = providers.flatMap((provider) =>
      provider.enabled === false
        ? []
        : (provider.models ?? []).map((model) => ({
            id: model.trim(),
            selector: `${provider.name}/${model.trim()}`,
            displayName: provider.modelDisplayNames?.[model.trim()] ?? model.trim(),
            provider: provider.name,
          }))
    ).filter((model) => model.id);
    if (configuredModels.length > 0) return configuredModels;

    const modelIds = [
          "claude-opus-5",
          "claude-sonnet-4.5",
          "gpt-5.6-sol",
          "gpt-6-sol",
          "gpt-6-astra",
          "gpt-5.6-terra",
          "deepseek-v4",
          "deepseek-v4-flash",
          "deepseek-v4.1-flash",
          "glm-5.3-flash",
          "glm-5.3"
        ];

    return modelIds.map((modelId) => {
      const entry = findModelCatalogEntry(modelId);
      return entry
        ? modelCatalogEntryToInfo(entry)
        : { id: modelId, selector: modelId, displayName: modelId };
    });
  }

  private findAvailableModel(model: string, providers: GatewayProviderConfig[]): ModelInfo | undefined {
    const normalized = model.trim();
    if (normalized === ORCHESTRA_MODEL_ID) {
      return { id: ORCHESTRA_MODEL_ID, displayName: "Orchestra", provider: "ccr" };
    }
    if (providers.length === 0) {
      const catalogEntry = findModelCatalogEntry(normalized);
      return catalogEntry ? { ...modelCatalogEntryToInfo(catalogEntry), selector: normalized } : undefined;
    }
    const registry = modelRegistryForConfig({ Providers: providers, virtualModelProfiles: [] });
    const resolved = registry.resolveProviderModel(normalized) ?? registry.resolveUniqueProviderModel(normalized);
    if (!resolved) return undefined;
    const provider = resolved.provider;
    return {
      id: resolved.model,
      selector: `${provider.name}/${resolved.model}`,
      displayName: provider.modelDisplayNames?.[resolved.model] ?? resolved.model,
      provider: provider.name,
    };
  }
}

function modelControlPathSegments(path: string): string[] {
  const withoutPrefix = path.startsWith(ccrModelControlPathPrefix)
    ? path.slice(ccrModelControlPathPrefix.length)
    : path;
  return withoutPrefix
    .split("/")
    .filter((s) => s.length > 0)
    .map((s) => decodeURIComponent(s));
}

// Singleton instance
let instance: ModelControlService | undefined;

export function getModelControlService(): ModelControlService {
  if (!instance) {
    instance = new ModelControlService();
  }
  return instance;
}

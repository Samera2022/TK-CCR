/**
 * Model control service - handles model switching and budget management
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { findModelCatalogEntry } from "@ccr/core/gateway/model-catalog";
import { getSessionModelBindingManager } from "@ccr/core/gateway/session-model-binding";
import { getBudgetTracker } from "@ccr/core/gateway/budget-tracker";
import type {
  ModelSwitchRequest,
  ModelSwitchResponse,
  ModelsListResponse,
  BudgetQueryResponse,
  ModelInfo,
} from "@ccr/core/models/model-control-types";
import { modelCatalogEntryToInfo } from "@ccr/core/models/model-control-types";

export const ccrModelControlPathPrefix = "/__ccr/model-control/v1";

export type ModelControlRequestContext = {
  endpoint: string;
  path: string;
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
      },
      endpoints: {
        switch: "POST /__ccr/model-control/v1/switch",
        models: "GET /__ccr/model-control/v1/models",
        budget: "GET /__ccr/model-control/v1/budget/:sessionKey",
        budgetConfirm: "POST /__ccr/model-control/v1/budget-confirm",
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
    if (!body.sessionKey || !body.targetModel || !body.reason) {
      context.sendJson(context.response, 400, {
        error: { message: "Missing required fields: sessionKey, targetModel, reason." },
      });
      return;
    }

    // Check if target model exists
    const targetEntry = findModelCatalogEntry(body.targetModel);
    if (!targetEntry) {
      // Model not found, return available models
      const availableModels = this.getAvailableModels();
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
    sessionManager.setCurrentModel(body.sessionKey, body.targetModel);

    // Reset budget for new model
    const budgetTracker = getBudgetTracker();
    budgetTracker.resetUsage(body.sessionKey, body.targetModel);

    // Get budget state
    const budgetState = budgetTracker.getBudgetState(body.sessionKey) || {
      model: body.targetModel,
      budget: budgetTracker.getModelBudget(body.targetModel),
      used: 0,
      remaining: budgetTracker.getModelBudget(body.targetModel),
      percentage: 0,
    };

    const response: ModelSwitchResponse = {
      success: true,
      previousModel,
      currentModel: body.targetModel,
      budgetState,
    };

    context.sendJson(context.response, 200, response);
  }

  private async handleListModels(context: ModelControlRequestContext): Promise<void> {
    const models = this.getAvailableModels();
    const response: ModelsListResponse = { models };
    context.sendJson(context.response, 200, response);
  }

  private async handleBudgetQuery(context: ModelControlRequestContext, sessionKey: string): Promise<void> {
    const budgetTracker = getBudgetTracker();
    const budgetState = budgetTracker.getBudgetState(sessionKey);

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
    let body: { action: string; sessionKey: string; model: string; targetModel?: string };
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

    if (body.action === "switch" && !body.targetModel) {
      context.sendJson(context.response, 400, {
        error: { message: "targetModel is required when action is 'switch'." },
      });
      return;
    }

    const sessionManager = getSessionModelBindingManager();
    const budgetTracker = getBudgetTracker();

    // Handle the confirmation
    if (body.action === "continue") {
      // Continue with current model, no action needed
      context.sendJson(context.response, 200, {
        success: true,
        message: `Continuing with model ${body.model}`,
        action: "continue",
      });
    } else if (body.action === "switch") {
      // Validate target model exists
      const targetEntry = findModelCatalogEntry(body.targetModel!);
      if (!targetEntry) {
        const availableModels = this.getAvailableModels();
        context.sendJson(context.response, 404, {
          success: false,
          error: "Target model not found",
          availableModels,
        });
        return;
      }

      // Switch model and reset budget
      sessionManager.setCurrentModel(body.sessionKey, body.targetModel!);
      budgetTracker.resetUsage(body.sessionKey, body.targetModel!);

      context.sendJson(context.response, 200, {
        success: true,
        message: `Switched from ${body.model} to ${body.targetModel}`,
        action: "switch",
        newModel: body.targetModel,
      });
    } else if (body.action === "stop") {
      context.sendJson(context.response, 200, {
        success: true,
        message: "Task execution stopped per user request",
        action: "stop",
        stopped: true,
      });
    }
  }

  private getAvailableModels(): ModelInfo[] {
    // Get common models from catalog
    const commonModelIds = [
      "claude-opus-5",
      "claude-sonnet-4.5",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "deepseek-v4",
      "deepseek-v4-flash",
      "glm-5.3",
    ];

    const models: ModelInfo[] = [];
    for (const modelId of commonModelIds) {
      const entry = findModelCatalogEntry(modelId);
      if (entry) {
        models.push(modelCatalogEntryToInfo(entry));
      }
    }

    return models;
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

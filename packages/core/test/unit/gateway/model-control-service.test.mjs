/**
 * Tests for model control service
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { getModelControlService, ccrModelControlPathPrefix } from "@ccr/core/gateway/model-control-service";
import { getSessionModelBindingManager } from "@ccr/core/gateway/session-model-binding";
import { getBudgetTracker } from "@ccr/core/gateway/budget-tracker";
import { getSessionReasoningBindingManager } from "@ccr/core/gateway/session-reasoning-binding";

describe("ModelControlService", () => {
  let service;

  before(() => {
    service = getModelControlService();
  });

  it("should return capabilities at root path", async () => {
    const mockContext = {
      endpoint: "http://localhost:3000",
      path: ccrModelControlPathPrefix,
      readBody: async () => Buffer.from(""),
      request: { method: "GET" },
      response: {},
      sendJson: (response, statusCode, payload) => {
        assert.equal(statusCode, 200);
        assert.ok(payload.capabilities);
        assert.equal(payload.capabilities.modelSwitching, true);
        assert.equal(payload.capabilities.budgetTracking, true);
        assert.equal(payload.capabilities.orchestra, true);
      },
    };

    await service.handleRequest(mockContext);
  });

  it("should list available models", async () => {
    const mockContext = {
      endpoint: "http://localhost:3000",
      path: `${ccrModelControlPathPrefix}/models`,
      readBody: async () => Buffer.from(""),
      request: { method: "GET" },
      response: {},
      sendJson: (response, statusCode, payload) => {
        assert.equal(statusCode, 200);
        assert.ok(Array.isArray(payload.models));
        assert.ok(payload.models.length > 0);
        assert.ok(payload.models[0].id);
        assert.ok(payload.models[0].displayName);
      },
    };

    await service.handleRequest(mockContext);
  });

  it("should switch model successfully", async () => {
    // Reset session first
    const sessionKey = "codex:test-switch-session";
    const sessionManager = getSessionModelBindingManager();
    sessionManager.clearBinding(sessionKey);

    const requestBody = {
      sessionKey,
      targetModel: "gpt-5.6-sol",
      reason: "Test switch",
    };

    const mockContext = {
      endpoint: "http://localhost:3000",
      path: `${ccrModelControlPathPrefix}/switch`,
      readBody: async () => Buffer.from(JSON.stringify(requestBody)),
      request: { method: "POST" },
      response: {},
      sendJson: (response, statusCode, payload) => {
        assert.equal(statusCode, 200);
        assert.equal(payload.success, true);
        assert.equal(payload.currentModel, "gpt-5.6-sol");
        assert.ok(payload.budgetState);
        assert.equal(payload.budgetState.model, "gpt-5.6-sol");
      },
    };

    await service.handleRequest(mockContext);

    // Verify binding was set
    const currentModel = sessionManager.getCurrentModel(sessionKey);
    assert.equal(currentModel, "gpt-5.6-sol");
  });

  it("should return error for non-existent model", async () => {
    const requestBody = {
      sessionKey: "codex:test-session",
      targetModel: "non-existent-model-xyz-12345",
      reason: "Test switch",
    };

    const mockContext = {
      endpoint: "http://localhost:3000",
      path: `${ccrModelControlPathPrefix}/switch`,
      readBody: async () => Buffer.from(JSON.stringify(requestBody)),
      request: { method: "POST" },
      response: {},
      sendJson: (response, statusCode, payload) => {
        assert.equal(statusCode, 404);
        assert.equal(payload.success, false);
        assert.equal(payload.error, "Model not found");
        assert.ok(Array.isArray(payload.availableModels));
      },
    };

    await service.handleRequest(mockContext);
  });

  it("should return budget state for session", async () => {
    const sessionKey = "codex:budget-test-session";
    const model = "gpt-5.6-sol";
    
    // Record some usage first
    const budgetTracker = getBudgetTracker();
    budgetTracker.resetUsage(sessionKey, model);
    budgetTracker.recordUsage(sessionKey, model, 1000, 500);

    const mockContext = {
      endpoint: "http://localhost:3000",
      path: `${ccrModelControlPathPrefix}/budget/${sessionKey}`,
      readBody: async () => Buffer.from(""),
      request: { method: "GET" },
      response: {},
      sendJson: (response, statusCode, payload) => {
        assert.equal(statusCode, 200);
        assert.equal(payload.sessionKey, sessionKey);
        assert.equal(payload.model, model);
        assert.equal(payload.used, 1500);
        assert.ok(payload.remaining >= 0);
      },
    };

    await service.handleRequest(mockContext);
  });

  it("should return 404 for budget query on non-existent session", async () => {
    const mockContext = {
      endpoint: "http://localhost:3000",
      path: `${ccrModelControlPathPrefix}/budget/non-existent-session-xyz`,
      readBody: async () => Buffer.from(""),
      request: { method: "GET" },
      response: {},
      sendJson: (response, statusCode, payload) => {
        assert.equal(statusCode, 404);
        assert.ok(payload.error);
        assert.ok(payload.error.message.includes("No budget information"));
      },
    };

    await service.handleRequest(mockContext);
  });

  it("should clear a pending budget confirmation after continue", async () => {
    const sessionKey = "codex:budget-confirm-session";
    const model = "gpt-5.6-sol";
    const budgetTracker = getBudgetTracker();
    budgetTracker.updateConfig({ defaultBudget: 100, warningThreshold: 100, models: {} });
    budgetTracker.resetUsage(sessionKey, model);
    budgetTracker.recordUsage(sessionKey, model, 100, 0);
    budgetTracker.createConfirmationRequest(sessionKey, model, "/v1/responses");
    assert.equal(budgetTracker.hasPendingConfirmation(sessionKey, model), true);

    const requestBody = {
      action: "continue",
      sessionKey,
      model,
    };
    const mockContext = {
      endpoint: "http://localhost:3000",
      path: `${ccrModelControlPathPrefix}/budget-confirm`,
      readBody: async () => Buffer.from(JSON.stringify(requestBody)),
      request: { method: "POST" },
      response: {},
      sendJson: (response, statusCode, payload) => {
        assert.equal(statusCode, 200);
        assert.equal(payload.action, "continue");
      },
    };

    await service.handleRequest(mockContext);
    assert.equal(budgetTracker.hasPendingConfirmation(sessionKey, model), false);
    assert.equal(budgetTracker.isOverBudgetAllowed(sessionKey, model), true);
    budgetTracker.resetUsage(sessionKey, model);
  });

  it("should set and report a session reasoning effort", async () => {
    const sessionKey = "codex:reasoning-api-session";
    const reasoningManager = getSessionReasoningBindingManager();
    reasoningManager.clearBinding(sessionKey);

    const setContext = {
      endpoint: "http://localhost:3000",
      path: `${ccrModelControlPathPrefix}/reasoning`,
      readBody: async () => Buffer.from(JSON.stringify({ effort: "xhigh", sessionKey })),
      request: { method: "POST" },
      response: {},
      sendJson: (response, statusCode, payload) => {
        assert.equal(statusCode, 200);
        assert.equal(payload.success, true);
        assert.equal(payload.effort, "xhigh");
        assert.ok(payload.levels.includes("xhigh"));
      },
    };
    await service.handleRequest(setContext);
    assert.equal(reasoningManager.getEffort(sessionKey), "xhigh");

    const queryContext = {
      defaultReasoningEffort: "medium",
      endpoint: "http://localhost:3000",
      path: `${ccrModelControlPathPrefix}/reasoning/${sessionKey}`,
      readBody: async () => Buffer.from(""),
      request: { method: "GET" },
      response: {},
      sendJson: (response, statusCode, payload) => {
        assert.equal(statusCode, 200);
        assert.equal(payload.effort, "xhigh");
        assert.equal(payload.source, "session");
      },
    };
    await service.handleRequest(queryContext);

    const resetContext = {
      defaultReasoningEffort: "medium",
      endpoint: "http://localhost:3000",
      path: `${ccrModelControlPathPrefix}/reasoning`,
      readBody: async () => Buffer.from(JSON.stringify({ effort: "reset", sessionKey })),
      request: { method: "POST" },
      response: {},
      sendJson: (response, statusCode, payload) => {
        assert.equal(statusCode, 200);
        assert.equal(payload.previousEffort, "xhigh");
        assert.equal(payload.effort, "medium");
      },
    };
    await service.handleRequest(resetContext);
    assert.equal(reasoningManager.getEffort(sessionKey), undefined);
  });

  it("should reject an unsupported reasoning effort", async () => {
    const mockContext = {
      endpoint: "http://localhost:3000",
      path: `${ccrModelControlPathPrefix}/reasoning`,
      readBody: async () => Buffer.from(JSON.stringify({ effort: "turbo", sessionKey: "codex:x" })),
      request: { method: "POST" },
      response: {},
      sendJson: (response, statusCode, payload) => {
        assert.equal(statusCode, 400);
        assert.ok(payload.error.message.includes("Unsupported reasoning effort"));
      },
    };
    await service.handleRequest(mockContext);
  });
});

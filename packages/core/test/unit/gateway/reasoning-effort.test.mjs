/**
 * Tests for reasoning effort resolution and protocol projection.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { applyReasoningEffort, resolveReasoningEffort } from "@ccr/core/gateway/features/reasoning-effort";
import { getSessionReasoningBindingManager } from "@ccr/core/gateway/session-reasoning-binding";
import { normalizeReasoningEffortLevel, nearestReasoningEffort } from "@ccr/core/models/reasoning-config";

describe("reasoning effort", () => {
  beforeEach(() => {
    getSessionReasoningBindingManager().clearBinding("codex:reasoning-session");
  });

  it("normalizes aliases to canonical levels", () => {
    assert.equal(normalizeReasoningEffortLevel("EXTRA_HIGH"), "xhigh");
    assert.equal(normalizeReasoningEffortLevel("max"), "xhigh");
    assert.equal(normalizeReasoningEffortLevel("off"), "none");
    assert.equal(normalizeReasoningEffortLevel("nonsense"), undefined);
  });

  it("snaps an unsupported level onto the nearest advertised level", () => {
    assert.deepEqual(nearestReasoningEffort("xhigh", ["low", "medium", "high"]), { adjusted: true, effort: "high" });
    assert.deepEqual(nearestReasoningEffort("medium", ["low", "medium", "high"]), { adjusted: false, effort: "medium" });
    assert.deepEqual(nearestReasoningEffort("xhigh", []), { adjusted: false, effort: "xhigh" });
  });

  it("writes reasoning.effort for the Responses protocol", () => {
    const result = applyReasoningEffort({
      body: JSON.stringify({ input: "hi", model: "gpt-6-sol", stream: true }),
      effort: "high",
      protocol: "openai_responses",
      supportedLevels: ["low", "medium", "high"]
    });
    assert.equal(result.applied, true);
    assert.equal(JSON.parse(result.body).reasoning.effort, "high");
  });

  it("writes reasoning_effort for the chat completions protocol", () => {
    const result = applyReasoningEffort({
      body: JSON.stringify({ messages: [{ content: "hi", role: "user" }], model: "deepseek-v4.1-flash" }),
      effort: "minimal",
      protocol: "openai_chat_completions"
    });
    assert.equal(result.applied, true);
    assert.equal(JSON.parse(result.body).reasoning_effort, "minimal");
  });

  it("uses an anthropic thinking budget capped below max_tokens", () => {
    const result = applyReasoningEffort({
      body: JSON.stringify({ max_tokens: 4096, messages: [{ content: "hi", role: "user" }], model: "claude-opus-5" }),
      effort: "xhigh",
      protocol: "anthropic_messages"
    });
    assert.equal(result.applied, true);
    const parsed = JSON.parse(result.body);
    assert.equal(parsed.thinking.type, "enabled");
    assert.ok(parsed.thinking.budget_tokens < parsed.max_tokens);
  });

  it("skips the anthropic budget when max_tokens leaves no room", () => {
    const result = applyReasoningEffort({
      body: JSON.stringify({ max_tokens: 1024, messages: [{ content: "hi", role: "user" }], model: "claude-opus-5" }),
      effort: "high",
      protocol: "anthropic_messages"
    });
    assert.equal(result.applied, false);
  });

  it("leaves the body untouched for unsupported protocols", () => {
    const body = JSON.stringify({ contents: [], model: "gemini-x" });
    const result = applyReasoningEffort({ body, effort: "high", protocol: "gemini_generate_content" });
    assert.equal(result.applied, false);
    assert.equal(result.body, body);
  });

  it("resolves the header ahead of the session binding", () => {
    const manager = getSessionReasoningBindingManager();
    manager.setEffort("codex:reasoning-session", "low");
    const resolution = resolveReasoningEffort({
      body: JSON.stringify({ input: "hi", model: "x" }),
      client: "codex",
      config: { enabled: true, defaultEffort: "medium", models: {} },
      headers: { "x-ccr-reasoning-effort": "xhigh" },
      sessionId: "reasoning-session"
    });
    assert.equal(resolution.source, "header");
    assert.equal(resolution.effort, "xhigh");
  });

  it("uses the session binding when no header is present", () => {
    const manager = getSessionReasoningBindingManager();
    manager.setEffort("codex:reasoning-session", "medium");
    const resolution = resolveReasoningEffort({
      body: JSON.stringify({ input: "hi", model: "x" }),
      client: "codex",
      config: { enabled: true, defaultEffort: "", models: {} },
      headers: {},
      sessionId: "reasoning-session"
    });
    assert.equal(resolution.source, "session");
    assert.equal(resolution.effort, "medium");
  });

  it("never downgrades a client-selected effort with the configured default", () => {
    const resolution = resolveReasoningEffort({
      body: JSON.stringify({ input: "hi", model: "x", reasoning: { effort: "xhigh" } }),
      client: "codex",
      config: { enabled: true, defaultEffort: "low", models: {} },
      headers: {}
    });
    assert.equal(resolution, undefined);
  });

  it("applies the configured default when the client asked for nothing", () => {
    const resolution = resolveReasoningEffort({
      body: JSON.stringify({ input: "hi", model: "x" }),
      client: "codex",
      config: { enabled: true, defaultEffort: "medium", models: {} },
      headers: {}
    });
    assert.equal(resolution.source, "default");
    assert.equal(resolution.effort, "medium");
  });

  it("honors a per-model override", () => {
    const resolution = resolveReasoningEffort({
      body: JSON.stringify({ input: "hi", model: "x" }),
      client: "codex",
      config: { enabled: true, defaultEffort: "", models: { "gpt-6-astra": "xhigh" } },
      headers: {},
      model: "gpt-6-astra"
    });
    assert.equal(resolution.source, "model");
    assert.equal(resolution.effort, "xhigh");
  });

  it("does nothing when the feature is disabled", () => {
    const resolution = resolveReasoningEffort({
      body: JSON.stringify({ input: "hi", model: "x" }),
      client: "codex",
      config: { enabled: false, defaultEffort: "high", models: {} },
      headers: {}
    });
    assert.equal(resolution, undefined);
  });
});

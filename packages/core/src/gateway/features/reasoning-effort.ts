/**
 * Reasoning effort feature - resolves the thinking budget for a request and
 * projects it onto the client protocol's own vocabulary.
 */

import type { GatewayProviderProtocol } from "@ccr/core/contracts/app";
import type { RequestRouteTraceChange } from "@ccr/core/contracts/app";
import { parseJsonObjectSafe, serializeJsonBody } from "@ccr/core/gateway/http/body";
import { readHeader } from "@ccr/core/gateway/http/io";
import { getSessionReasoningBindingManager } from "@ccr/core/gateway/session-reasoning-binding";
import type { ReasoningConfig, ReasoningEffortLevel } from "@ccr/core/models/reasoning-config";
import { anthropicThinkingBudget, normalizeReasoningEffortLevel, nearestReasoningEffort } from "@ccr/core/models/reasoning-config";

export const ccrReasoningEffortHeader = "x-ccr-reasoning-effort";
export const ccrReasoningSourceHeader = "x-ccr-reasoning-source";

export type ReasoningEffortResolution = {
  effort: ReasoningEffortLevel;
  override: boolean;
  source: "header" | "session" | "model" | "default";
};

export type ReasoningEffortResult = {
  applied: boolean;
  adjusted: boolean;
  body: string;
  changes: RequestRouteTraceChange[];
  effort?: ReasoningEffortLevel;
  source?: ReasoningEffortResolution["source"];
};

/**
 * Resolve the effort CCR should enforce for this request.
 *
 * Precedence: request header, then session binding, then the per-model
 * override in configuration. When none of those decide, `defaultEffort` is
 * used only if the client did not ask for an effort of its own, so an agent's
 * own selection is never silently downgraded.
 */
export function resolveReasoningEffort(input: {
  body: string;
  client?: string;
  config: ReasoningConfig | undefined;
  headers: Record<string, string | string[] | undefined>;
  model?: string;
  sessionId?: string;
}): ReasoningEffortResolution | undefined {
  const config = input.config;
  const headerEffort = normalizeReasoningEffortLevel(readHeader(input.headers[ccrReasoningEffortHeader]));
  if (headerEffort) {
    return { effort: headerEffort, override: true, source: "header" };
  }

  if (input.client) {
    const sessionManager = getSessionReasoningBindingManager();
    const sessionKey = sessionManager.getSessionKey(input.client, input.sessionId);
    const sessionEffort = sessionManager.getEffort(sessionKey);
    if (sessionEffort) {
      return { effort: sessionEffort, override: true, source: "session" };
    }
  }

  if (config?.enabled === false) {
    return undefined;
  }

  const modelEffort = normalizeReasoningEffortLevel(
    input.model ? config?.models?.[input.model] ?? config?.models?.[modelTail(input.model)] : undefined
  );
  if (modelEffort) {
    return { effort: modelEffort, override: true, source: "model" };
  }

  const defaultEffort = normalizeReasoningEffortLevel(config?.defaultEffort);
  if (defaultEffort && !requestCarriesReasoning(input.body)) {
    return { effort: defaultEffort, override: false, source: "default" };
  }

  return undefined;
}

/**
 * Apply an effort level to a request body for the given client protocol.
 * Returns the original body untouched when the protocol has no reasoning
 * vocabulary, the body is not JSON, or the effort equals what is already set.
 */
export function applyReasoningEffort(input: {
  body: string;
  effort: ReasoningEffortLevel;
  protocol: GatewayProviderProtocol | undefined;
  supportedLevels?: readonly string[];
}): ReasoningEffortResult {
  const parsed = parseJsonObjectSafe(Buffer.from(input.body));
  if (!parsed || !looksLikeModelRequest(parsed)) {
    return { adjusted: false, applied: false, body: input.body, changes: [] };
  }

  const snapped = nearestReasoningEffort(input.effort, input.supportedLevels ?? []);
  const effort = snapped.effort;
  const next = { ...parsed };
  const changes: RequestRouteTraceChange[] = [];

  if (input.protocol === "openai_responses") {
    const existing = isPlainObject(next.reasoning) ? { ...next.reasoning } : {};
    const previousEffort = typeof existing.effort === "string" ? existing.effort : undefined;
    if (effort === "none") {
      if (!("reasoning" in next)) {
        return { adjusted: false, applied: false, body: input.body, changes: [] };
      }
      delete next.reasoning;
      changes.push(traceChange("/body/reasoning", previousEffort, undefined, "remove"));
    } else {
      if (previousEffort === effort) {
        return { adjusted: false, applied: false, body: input.body, changes: [] };
      }
      next.reasoning = { ...existing, effort };
      changes.push(traceChange("/body/reasoning/effort", previousEffort, effort, previousEffort ? "replace" : "add"));
    }
  } else if (input.protocol === "openai_chat_completions") {
    const previousEffort = typeof next.reasoning_effort === "string" ? next.reasoning_effort : undefined;
    if (effort === "none") {
      if (previousEffort === undefined) {
        return { adjusted: false, applied: false, body: input.body, changes: [] };
      }
      delete next.reasoning_effort;
      changes.push(traceChange("/body/reasoning_effort", previousEffort, undefined, "remove"));
    } else {
      if (previousEffort === effort) {
        return { adjusted: false, applied: false, body: input.body, changes: [] };
      }
      next.reasoning_effort = effort;
      changes.push(traceChange("/body/reasoning_effort", previousEffort, effort, previousEffort ? "replace" : "add"));
    }
  } else if (input.protocol === "anthropic_messages") {
    const previous = isPlainObject(next.thinking) ? { ...next.thinking } : undefined;
    if (effort === "none") {
      if (!previous) {
        return { adjusted: false, applied: false, body: input.body, changes: [] };
      }
      delete next.thinking;
      changes.push(traceChange("/body/thinking", previous, undefined, "remove"));
    } else {
      const maxTokens = typeof next.max_tokens === "number" ? next.max_tokens : undefined;
      const budget = anthropicThinkingBudget(effort, maxTokens);
      if (budget === undefined) {
        return { adjusted: false, applied: false, body: input.body, changes: [] };
      }
      if (previous?.type === "enabled" && previous.budget_tokens === budget) {
        return { adjusted: false, applied: false, body: input.body, changes: [] };
      }
      next.thinking = { type: "enabled", budget_tokens: budget };
      changes.push(traceChange("/body/thinking", previous, next.thinking, previous ? "replace" : "add"));
      if (typeof next.temperature === "number" && next.temperature !== 1) {
        delete next.temperature;
        changes.push(traceChange("/body/temperature", next.temperature, undefined, "remove"));
      }
    }
  } else {
    return { adjusted: false, applied: false, body: input.body, changes: [] };
  }

  return {
    adjusted: snapped.adjusted,
    applied: true,
    body: serializeJsonBody(next).toString("utf8"),
    changes,
    effort
  };
}

function requestCarriesReasoning(body: string): boolean {
  const parsed = parseJsonObjectSafe(Buffer.from(body));
  if (!parsed) {
    return false;
  }
  if (isPlainObject(parsed.reasoning) && typeof parsed.reasoning.effort === "string" && parsed.reasoning.effort.trim()) {
    return true;
  }
  if (typeof parsed.reasoning_effort === "string" && parsed.reasoning_effort.trim()) {
    return true;
  }
  if (isPlainObject(parsed.thinking) || typeof parsed.thinking === "string") {
    return true;
  }
  return false;
}

function looksLikeModelRequest(parsed: Record<string, unknown>): boolean {
  return typeof parsed.model === "string" || Array.isArray(parsed.messages) || parsed.input !== undefined;
}

function traceChange(
  path: string,
  before: unknown,
  after: unknown,
  operation: RequestRouteTraceChange["operation"]
): RequestRouteTraceChange {
  return { after, before, operation, path, scope: "body" };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function modelTail(model: string): string {
  const trimmed = model.trim();
  const slashIndex = trimmed.lastIndexOf("/");
  return slashIndex >= 0 ? trimmed.slice(slashIndex + 1) : trimmed;
}

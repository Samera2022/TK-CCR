/**
 * Reasoning (thinking) effort configuration, normalization, and validation.
 *
 * CCR ships a single vocabulary for "how much thinking" a request may spend,
 * then projects that value onto whichever client protocol asked for it:
 * `openai_responses` uses `reasoning.effort`, `openai_chat_completions` uses
 * `reasoning_effort`, and `anthropic_messages` uses a token budget under
 * `thinking`.
 */

export const REASONING_EFFORT_LEVELS = ["none", "minimal", "low", "medium", "high", "xhigh"] as const;

export type ReasoningEffortLevel = (typeof REASONING_EFFORT_LEVELS)[number];

export interface ReasoningConfig {
  enabled: boolean;
  defaultEffort: ReasoningEffortLevel | "";
  models: Record<string, ReasoningEffortLevel>;
}

const reasoningEffortAliases: Record<string, ReasoningEffortLevel> = {
  disabled: "none",
  extrahigh: "xhigh",
  extraigh: "xhigh",
  max: "xhigh",
  maximum: "xhigh",
  off: "none",
  minimal: "minimal",
  minimum: "minimal",
  none: "none",
  low: "low",
  medium: "medium",
  med: "medium",
  high: "high",
  xhigh: "xhigh"
};

const anthropicThinkingBudgets: Record<Exclude<ReasoningEffortLevel, "none">, number> = {
  minimal: 1024,
  low: 2048,
  medium: 4096,
  high: 8192,
  xhigh: 16384
};

/**
 * Normalize user/config input into a canonical effort level.
 * Returns `undefined` for empty or unknown values so callers can fall back.
 */
export function normalizeReasoningEffortLevel(value: unknown): ReasoningEffortLevel | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const key = value.trim().toLowerCase().replace(/[_\s-]+/g, "");
  if (!key) {
    return undefined;
  }
  const level = reasoningEffortAliases[key];
  return level;
}

export function isReasoningEffortLevel(value: unknown): value is ReasoningEffortLevel {
  return normalizeReasoningEffortLevel(value) !== undefined;
}

export function reasoningEffortRank(level: ReasoningEffortLevel): number {
  return REASONING_EFFORT_LEVELS.indexOf(level);
}

/**
 * Snap a requested effort onto the levels a model actually advertises.
 * An empty `supported` list means "unknown", so the request is honored as-is.
 */
export function nearestReasoningEffort(
  requested: ReasoningEffortLevel,
  supported: readonly string[]
): { adjusted: boolean; effort: ReasoningEffortLevel } {
  const normalizedSupported = supported
    .map((level) => normalizeReasoningEffortLevel(level))
    .filter((level): level is ReasoningEffortLevel => level !== undefined);
  if (normalizedSupported.length === 0) {
    return { adjusted: false, effort: requested };
  }
  if (normalizedSupported.includes(requested)) {
    return { adjusted: false, effort: requested };
  }
  const requestedRank = reasoningEffortRank(requested);
  let best = normalizedSupported[0];
  let bestDistance = Math.abs(reasoningEffortRank(best) - requestedRank);
  for (const candidate of normalizedSupported.slice(1)) {
    const distance = Math.abs(reasoningEffortRank(candidate) - requestedRank);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return { adjusted: best !== requested, effort: best };
}

/**
 * Token budget for Anthropic `thinking`, capped so it stays strictly below the
 * request's `max_tokens`. Returns `undefined` when no valid budget can be met.
 */
export function anthropicThinkingBudget(
  effort: Exclude<ReasoningEffortLevel, "none">,
  maxTokens: number | undefined
): number | undefined {
  const desired = anthropicThinkingBudgets[effort];
  if (maxTokens === undefined) {
    return desired;
  }
  const ceiling = Math.floor(maxTokens) - 1024;
  if (ceiling < 1024) {
    return undefined;
  }
  return Math.min(desired, ceiling);
}

export const DEFAULT_REASONING_CONFIG: ReasoningConfig = {
  enabled: true,
  defaultEffort: "",
  models: {}
};

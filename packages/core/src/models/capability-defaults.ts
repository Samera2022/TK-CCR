import type { ProviderModelCapabilities, ProviderModelMetadata } from "@ccr/core/contracts/app";

export const GENERAL_MODEL_CAPABILITY_DEFAULTS: Readonly<ProviderModelCapabilities> = {
  structuredOutput: true,
  textInput: true,
  toolUse: true
};

export function generalModelCapabilities(model: string): ProviderModelCapabilities {
  const normalized = model.trim().toLowerCase();
  const capabilities: ProviderModelCapabilities = { ...GENERAL_MODEL_CAPABILITY_DEFAULTS };

  if (/\b(claude|gemini|gpt-4|gpt-4o|gpt-5|o[1-9]|qwen-vl|qwen2\.5-vl|vision|pixtral|llava)\b/.test(normalized)) {
    capabilities.imageInput = true;
  }
  if (/\b(claude|gemini|gpt-4o|gpt-5|o[1-9]|deepseek-reasoner|deepseek-r1|qwen.*thinking|reasoning)\b/.test(normalized)) {
    capabilities.reasoning = true;
  }
  if (/\b(claude|gemini|gpt-4o|gpt-5|o[1-9]|deepseek|qwen|mistral)\b/.test(normalized)) {
    capabilities.webSearch = true;
  }
  return capabilities;
}

export function applyGeneralModelCapabilityDefaults(
  models: readonly string[],
  metadata?: Record<string, ProviderModelMetadata>
): Record<string, ProviderModelMetadata> | undefined {
  const result: Record<string, ProviderModelMetadata> = {};
  for (const model of models) {
    const current = metadata?.[model];
    if (!current) {
      continue;
    }
    result[model] = {
      ...(current ?? {}),
      capabilities: {
        ...generalModelCapabilities(model),
        ...(current?.capabilities ?? {})
      }
    };
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

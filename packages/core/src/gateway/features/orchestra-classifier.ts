import type { GatewayProviderConfig } from "@ccr/core/contracts/app";
import type { OrchestraClassificationRequest, OrchestraClassificationResponse } from "@ccr/core/gateway/features/orchestra-engine-v2";

const CLASSIFIER_INSTRUCTIONS = `Select exactly one role for the task. Return JSON only:
{"selectedRole":"role-name","confidence":0.0,"reasoning":"brief reason"}`;

export function createOrchestraClassifier(providers: GatewayProviderConfig[]) {
  return async (request: OrchestraClassificationRequest): Promise<OrchestraClassificationResponse> => {
    const provider = findProvider(providers, request.orchestratorModel);
    if (!provider) throw new Error(`No provider configured for orchestra model ${request.orchestratorModel}`);

    const endpoint = providerEndpoint(provider);
    const apiKey = providerApiKey(provider);
    const protocol = providerProtocol(provider);
    const prompt = `${CLASSIFIER_INSTRUCTIONS}\n\nAvailable roles:\n${request.availableRoles.map((role) =>
      `- ${role.name}: ${role.systemPrompt}; triggers=${role.triggers.join(", ")}`
    ).join("\n")}\n\nTask:\n${request.userMessage}`;
    const headers: Record<string, string> = { accept: "application/json", "content-type": "application/json" };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    if (protocol === "anthropic_messages") headers["x-api-key"] = apiKey;

    const body = protocol === "anthropic_messages"
      ? { model: request.orchestratorModel, max_tokens: 256, system: CLASSIFIER_INSTRUCTIONS, messages: [{ role: "user", content: prompt }] }
      : protocol === "openai_responses"
        ? { model: request.orchestratorModel, max_output_tokens: 256, input: prompt }
        : { model: request.orchestratorModel, max_tokens: 256, temperature: 0, messages: [{ role: "system", content: CLASSIFIER_INSTRUCTIONS }, { role: "user", content: prompt }] };

    const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`Orchestra classifier failed with status ${response.status}`);
    const payload = await response.json() as Record<string, unknown>;
    const text = extractText(payload);
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? text) as Partial<OrchestraClassificationResponse>;
    if (typeof parsed.selectedRole !== "string") throw new Error("Orchestra classifier returned no role");
    return {
      selectedRole: parsed.selectedRole,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "Selected by orchestra model"
    };
  };
}

function findProvider(providers: GatewayProviderConfig[], model: string): GatewayProviderConfig | undefined {
  return providers.find((provider) => provider.enabled !== false && provider.models?.some((candidate) =>
    candidate === model || candidate.split("/").pop() === model.split("/").pop()
  ));
}

function providerEndpoint(provider: GatewayProviderConfig): string {
  const base = (provider.api_base_url || provider.baseUrl || provider.baseurl || "").replace(/\/$/, "");
  const protocol = providerProtocol(provider);
  if (protocol === "anthropic_messages") return base.endsWith("/v1") ? `${base}/messages` : `${base}/v1/messages`;
  if (protocol === "openai_responses") return base.endsWith("/v1") ? `${base}/responses` : `${base}/v1/responses`;
  return base.endsWith("/v1") ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
}

function providerProtocol(provider: GatewayProviderConfig): string {
  const capability = provider.capabilities?.find((item) =>
    item.type === "anthropic_messages" || item.type === "openai_responses" || item.type === "openai_chat_completions"
  );
  return capability?.type ?? provider.type ?? "openai_chat_completions";
}

function providerApiKey(provider: GatewayProviderConfig): string {
  return provider.api_key || provider.apiKey || provider.apikey || provider.credentials?.find((credential) => credential.enabled !== false)?.api_key || "";
}

function extractText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string") return payload.output_text;
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const choice = choices[0] as Record<string, unknown> | undefined;
  const message = choice?.message as Record<string, unknown> | undefined;
  if (typeof message?.content === "string") return message.content;
  const content = Array.isArray(message?.content) ? message.content : [];
  const text = content.find((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).text === "string") as Record<string, unknown> | undefined;
  if (typeof text?.text === "string") return text.text;
  const blocks = Array.isArray(payload.content) ? payload.content : [];
  const block = blocks.find((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).text === "string") as Record<string, unknown> | undefined;
  if (typeof block?.text === "string") return block.text;
  throw new Error("Orchestra classifier returned no text");
}

export type ErrorRectifierContext = {
  model?: string;
  provider?: string;
  statusCode?: number;
};

export type ErrorRectifier = (payload: unknown, context: ErrorRectifierContext) => unknown;

const rectifiers: ErrorRectifier[] = [];

export function registerErrorRectifier(rectifier: ErrorRectifier): () => void {
  rectifiers.push(rectifier);
  return () => {
    const index = rectifiers.indexOf(rectifier);
    if (index >= 0) rectifiers.splice(index, 1);
  };
}

export function rectifyUpstreamError(payload: unknown, context: ErrorRectifierContext): unknown {
  if ((context.statusCode ?? 200) < 400) return payload;
  let current = payload;
  for (const rectifier of rectifiers) {
    current = rectifier(current, context);
  }
  return current;
}

export function normalizeGatewayErrorPayload(payload: unknown, context: ErrorRectifierContext): Record<string, unknown> {
  const source = isRecord(payload) ? payload : {};
  const sourceError = isRecord(source.error) ? source.error : source;
  const message = firstString(sourceError.message, source.message, sourceError.detail, sourceError.type) || "Upstream provider request failed.";
  const code = firstString(sourceError.code, source.code, sourceError.type);
  return {
    error: {
      ...(code ? { code } : {}),
      ...(context.model ? { model: context.model } : {}),
      ...(context.provider ? { provider: context.provider } : {}),
      message,
      type: firstString(sourceError.type) || "upstream_error"
    }
  };
}

export function resetErrorRectifiersForTest(): void {
  rectifiers.length = 0;
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

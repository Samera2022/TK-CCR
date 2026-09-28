import type { AppConfig, ProfileConfig, RouterFallbackConfig } from "@ccr/core/contracts/app";

export const GLOBAL_ORDER_LIST_ID = "global";
export const NON_STANDARD_ORDER_LIST_ID = "non-standard";

export function orderListFallbackForClient(config: AppConfig, profile?: ProfileConfig): RouterFallbackConfig {
  const orderLists = config.Router.orderLists ?? {};
  const clientId = profile?.id ?? NON_STANDARD_ORDER_LIST_ID;
  const entries = orderLists[clientId]?.length
    ? orderLists[clientId]
    : orderLists[GLOBAL_ORDER_LIST_ID] ?? [];
  if (entries.length === 0) {
    return config.Router.fallback;
  }
  return {
    mode: "model-chain",
    models: entries.map((entry) => `${entry.provider}/${entry.model}`),
    retryCount: config.Router.fallback.retryCount
  };
}

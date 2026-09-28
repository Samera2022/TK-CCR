import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { orderListFallbackForClient } from "@ccr/core/routing/order-list.ts";

test("order list fallback prefers a configured client chain", () => {
  const config = createDefaultAppConfig({});
  config.Router.fallback = { mode: "retry", models: [], retryCount: 2 };
  config.Router.orderLists = {
    global: [{ id: "g1", provider: "A", model: "global" }],
    "profile-1": [
      { id: "p1", provider: "A", model: "one" },
      { id: "p2", provider: "B", model: "two" }
    ]
  };

  assert.deepEqual(orderListFallbackForClient(config, { id: "profile-1" }), {
    mode: "model-chain",
    models: ["A/one", "B/two"],
    retryCount: 2
  });
});

test("order list fallback uses global then the configured fallback", () => {
  const config = createDefaultAppConfig({});
  config.Router.fallback = { mode: "retry", models: ["A/retry"], retryCount: 1 };
  config.Router.orderLists = {
    global: [{ id: "g1", provider: "A", model: "global" }]
  };

  assert.deepEqual(orderListFallbackForClient(config), {
    mode: "model-chain",
    models: ["A/global"],
    retryCount: 1
  });

  config.Router.orderLists = {};
  assert.strictEqual(orderListFallbackForClient(config), config.Router.fallback);
});

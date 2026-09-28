import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeGatewayErrorPayload,
  rectifyUpstreamError,
  registerErrorRectifier,
  resetErrorRectifiersForTest
} from "@ccr/core/gateway/rectifier/error-rectifier";

test.afterEach(() => resetErrorRectifiersForTest());

test("error rectifier provides a stable normalized envelope", () => {
  const result = normalizeGatewayErrorPayload({ error: { detail: "bad request", type: "invalid_request" } }, {
    model: "deepseek-chat",
    provider: "api.example.test",
    statusCode: 400
  });
  assert.deepEqual(result, {
    error: {
      code: "invalid_request",
      model: "deepseek-chat",
      provider: "api.example.test",
      message: "bad request",
      type: "invalid_request"
    }
  });
});

test("registered rectifiers can add provider-specific corrections", () => {
  registerErrorRectifier((payload) => ({ ...(payload ?? {}), corrected: true }));
  assert.deepEqual(rectifyUpstreamError({ message: "failure" }, { statusCode: 502 }), {
    corrected: true,
    message: "failure"
  });
  assert.deepEqual(rectifyUpstreamError({ message: "ok" }, { statusCode: 200 }), { message: "ok" });
});

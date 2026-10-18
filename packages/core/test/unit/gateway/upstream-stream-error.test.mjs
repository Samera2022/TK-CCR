import assert from "node:assert/strict";
import { Readable, Transform } from "node:stream";
import test from "node:test";
import { codexApplyPatchBridgeResponseStream } from "@ccr/core/gateway/features/codex-patch-bridge.ts";
import { pipeWithUpstreamErrorForwarding } from "@ccr/core/gateway/internal/stream-errors.ts";

function upstreamBodyStream() {
  const encoder = new TextEncoder();
  let controller;
  const body = new ReadableStream({
    start(value) {
      controller = value;
      value.enqueue(encoder.encode('event: response.created\ndata: {"type":"response.created"}\n\n'));
    }
  });
  return { body, fail: (error) => controller.error(error) };
}

// A provider proxy closing the socket mid-stream makes the `Readable.fromWeb`
// source emit `TypeError: terminated`. Without a listener on that source Node
// reports an unhandled error and terminates the whole gateway process.
test("upstream stream errors are forwarded to the piped destination", async () => {
  const { body, fail } = upstreamBodyStream();
  const source = Readable.fromWeb(body);
  const destination = pipeWithUpstreamErrorForwarding(source, new Transform({
    transform(chunk, _encoding, callback) {
      callback(null, chunk);
    }
  }));

  const failure = new Error("terminated");
  const forwarded = new Promise((resolve) => destination.once("error", resolve));
  destination.resume();
  fail(failure);

  assert.equal(await forwarded, failure);
});

test("piped gateway stream stages do not raise unhandled upstream errors", async () => {
  const unhandled = [];
  const onUncaught = (error) => unhandled.push(error);
  process.on("uncaughtException", onUncaught);

  try {
    const { body, fail } = upstreamBodyStream();
    const transformed = codexApplyPatchBridgeResponseStream(Readable.fromWeb(body), new Headers({
      "content-type": "text/event-stream"
    }));
    const failure = new Error("terminated");
    const forwarded = new Promise((resolve) => transformed.once("error", resolve));
    transformed.resume();

    fail(failure);

    assert.equal(await forwarded, failure);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("uncaughtException", onUncaught);
  }
});

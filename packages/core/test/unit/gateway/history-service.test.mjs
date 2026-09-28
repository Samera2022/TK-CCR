import assert from "node:assert/strict";
import test from "node:test";
import { HistoryService } from "@ccr/core/gateway/history/service";
import { HistoryStore } from "@ccr/core/gateway/history/store";

test("history service unifies threads by canonical project directory", () => {
  const store = new HistoryStore(":memory:");
  const service = new HistoryService(store);
  const created = service.handleRequest({
    body: { client: "codex", projectDirectory: "/tmp/toolkit", title: "Shared" },
    method: "POST",
    url: "/__ccr/history/v1/threads"
  });
  assert.equal(created.status, 201);
  const threadId = created.body.thread.id;
  service.handleRequest({
    body: { content: "hello", role: "user", source: "codex" },
    method: "POST",
    url: `/__ccr/history/v1/threads/${threadId}/messages`
  });
  const listed = service.handleRequest({
    body: {},
    method: "GET",
    url: "/__ccr/history/v1/threads?project_directory=/tmp/toolkit"
  });
  assert.equal(listed.body.threads.length, 1);
  const messages = service.handleRequest({
    body: {},
    method: "GET",
    url: `/__ccr/history/v1/threads/${threadId}/messages`
  });
  assert.equal(messages.body.messages[0].content, "hello");
  service.close();
});

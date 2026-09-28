import { randomUUID } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import path from "node:path";
import { HISTORY_DB_FILE } from "@ccr/core/config/constants";
import { HistoryStore, type HistoryMessage } from "@ccr/core/gateway/history/store";

export const historyPathPrefix = "/__ccr/history/v1";

export class HistoryService {
  private readonly store: HistoryStore;

  constructor(store = new HistoryStore(HISTORY_DB_FILE)) {
    this.store = store;
  }

  close(): void {
    this.store.close();
  }

  handleRequest(input: {
    body: unknown;
    headers?: IncomingHttpHeaders | Record<string, string | string[] | undefined>;
    method?: string;
    url?: string;
  }): { body: unknown; status: number } {
    const url = new URL(input.url ?? historyPathPrefix, "http://127.0.0.1");
    const route = url.pathname.slice(historyPathPrefix.length).replace(/^\/+/, "");
    const segments = route ? route.split("/").map(decodeURIComponent) : [];
    const method = (input.method ?? "GET").toUpperCase();
    const body = isRecord(input.body) ? input.body : {};

    if (segments.length === 0 && method === "GET") {
      return { body: { name: "ccr-history", protocol: "ccr.history.v1", endpoints: ["/threads", "/threads/{threadId}/messages"] }, status: 200 };
    }
    if (segments[0] !== "threads") return error(404, "History endpoint not found.");
    if (segments.length === 1 && method === "GET") {
      const projectDirectory = stringValue(url.searchParams.get("project_directory")) ?? stringValue(url.searchParams.get("projectDirectory"));
      if (!projectDirectory) return error(400, "project_directory is required.");
      const limit = boundedInteger(url.searchParams.get("limit"), 50, 1, 200);
      return { body: { threads: this.store.listThreads(canonicalProjectDirectoryKey(projectDirectory), limit) }, status: 200 };
    }
    if (segments.length === 1 && method === "POST") {
      const projectDirectory = stringValue(body.projectDirectory ?? body.project_directory);
      if (!projectDirectory) return error(400, "projectDirectory is required.");
      const id = stringValue(body.id) ?? `thr_${randomUUID()}`;
      const thread = this.store.createThread({
        client: stringValue(body.client),
        id,
        metadata: recordValue(body.metadata),
        projectDirectory,
        projectDirectoryKey: canonicalProjectDirectoryKey(projectDirectory),
        title: stringValue(body.title)
      });
      return { body: { thread }, status: 201 };
    }
    const threadId = segments[1];
    if (!threadId) return error(400, "threadId is required.");
    const thread = this.store.getThread(threadId);
    if (!thread) return error(404, "History thread not found.");
    if (segments.length === 2 && method === "GET") return { body: { thread }, status: 200 };
    if (segments.length === 3 && segments[2] === "messages" && method === "GET") {
      return {
        body: {
          messages: this.store.listMessages(threadId, boundedInteger(url.searchParams.get("limit"), 200, 1, 500), boundedInteger(url.searchParams.get("offset"), 0, 0, 100000))
        },
        status: 200
      };
    }
    if (segments.length === 3 && segments[2] === "messages" && method === "POST") {
      const role = stringValue(body.role);
      if (!role || body.content === undefined) return error(400, "role and content are required.");
      const message: HistoryMessage = this.store.appendMessage({
        content: body.content,
        id: stringValue(body.id) ?? `msg_${randomUUID()}`,
        metadata: recordValue(body.metadata),
        role,
        source: stringValue(body.source),
        threadId
      });
      return { body: { message }, status: 201 };
    }
    return error(404, "History endpoint not found.");
  }
}

export const historyService = new HistoryService();

export function canonicalProjectDirectoryKey(value: string): string {
  const resolved = path.resolve(value.trim()).replace(/[\\/]+$/, "") || path.parse(path.resolve(value.trim())).root;
  return process.platform === "win32" ? resolved.replaceAll("\\", "/").toLowerCase() : resolved;
}

function error(status: number, message: string): { body: unknown; status: number } {
  return { body: { error: { code: "history_request_invalid", message } }, status };
}

function stringValue(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function boundedInteger(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = value === null ? NaN : Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

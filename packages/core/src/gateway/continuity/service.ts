import { randomUUID } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import path from "node:path";
import { ContinuityStore } from "./store";
import { captureGitState } from "./git-state";
import type {
  CreateCheckpointRequest,
  CreateCheckpointResponse,
  ErrorResponse,
  GetLatestCheckpointResponse,
  ListCheckpointsResponse
} from "./protocol";

export const continuityPathPrefix = "/__ccr/continuity/v1";

export class ContinuityService {
  private readonly store: ContinuityStore;

  constructor(store?: ContinuityStore) {
    // Default to ~/.ccr/continuity.db if no store provided
    const defaultDbPath = path.join(
      process.env.HOME || process.env.USERPROFILE || ".",
      ".ccr",
      "continuity.db"
    );
    this.store = store ?? new ContinuityStore(defaultDbPath);
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
    const url = new URL(input.url ?? continuityPathPrefix, "http://127.0.0.1");
    const route = url.pathname.slice(continuityPathPrefix.length).replace(/^\/+/, "");
    const segments = route ? route.split("/").map(decodeURIComponent) : [];
    const method = (input.method ?? "GET").toUpperCase();
    const body = isRecord(input.body) ? input.body : {};

    // GET /__ccr/continuity/v1
    if (segments.length === 0 && method === "GET") {
      return {
        body: {
          name: "ccr-continuity",
          protocol: "ccr.continuity.v1",
          endpoints: [
            "/checkpoints",
            "/checkpoints/latest",
            "/git-state"
          ]
        },
        status: 200
      };
    }

    // POST /__ccr/continuity/v1/checkpoints
    if (segments[0] === "checkpoints" && segments.length === 1 && method === "POST") {
      return this.handleCreateCheckpoint(body as CreateCheckpointRequest);
    }

    // GET /__ccr/continuity/v1/checkpoints/latest?projectDirectory=...&gitBranch=...
    if (segments[0] === "checkpoints" && segments[1] === "latest" && method === "GET") {
      const projectDirectory = stringValue(url.searchParams.get("projectDirectory"));
      if (!projectDirectory) {
        return error(400, "projectDirectory is required.");
      }

      const checkpoint = this.store.getLatestCheckpoint(
        canonicalProjectDirectoryKey(projectDirectory),
        stringValue(url.searchParams.get("gitBranch")) ?? undefined
      );

      const response: GetLatestCheckpointResponse = {
        checkpoint: checkpoint ?? null
      };
      return { body: response, status: 200 };
    }

    // GET /__ccr/continuity/v1/checkpoints?projectDirectory=...&limit=...
    if (segments[0] === "checkpoints" && segments.length === 1 && method === "GET") {
      const projectDirectory = stringValue(url.searchParams.get("projectDirectory"));
      if (!projectDirectory) {
        return error(400, "projectDirectory is required.");
      }

      const limit = boundedInteger(url.searchParams.get("limit"), 10, 1, 50);
      const checkpoints = this.store.listCheckpoints(
        canonicalProjectDirectoryKey(projectDirectory),
        limit
      );

      const response: ListCheckpointsResponse = { checkpoints };
      return { body: response, status: 200 };
    }

    // GET /__ccr/continuity/v1/git-state?projectDirectory=...
    if (segments[0] === "git-state" && segments.length === 1 && method === "GET") {
      const projectDirectory = stringValue(url.searchParams.get("projectDirectory"));
      if (!projectDirectory) {
        return error(400, "projectDirectory is required.");
      }
      return {
        body: { gitState: captureGitState(projectDirectory) },
        status: 200
      };
    }

    // GET /__ccr/continuity/v1/checkpoints/:id
    if (segments[0] === "checkpoints" && segments.length === 2 && method === "GET") {
      const checkpoint = this.store.getCheckpoint(segments[1]);
      if (!checkpoint) {
        return error(404, "Checkpoint not found.");
      }
      return { body: { checkpoint }, status: 200 };
    }

    return error(404, "Continuity endpoint not found.");
  }

  private handleCreateCheckpoint(
    request: CreateCheckpointRequest
  ): { body: CreateCheckpointResponse | ErrorResponse; status: number } {
    const projectDirectory = stringValue(request.projectDirectory);
    if (!projectDirectory) {
      return error(400, "projectDirectory is required.");
    }

    const checkpoint = this.store.createCheckpoint({
      id: stringValue(request.id) ?? `chk_${randomUUID()}`,
      projectDirectory,
      projectDirectoryKey: canonicalProjectDirectoryKey(projectDirectory),
      client: stringValue(request.client) ?? "unknown",
      gitBranch: stringValue(request.gitBranch) ?? null,
      gitHeadSha: stringValue(request.gitHeadSha) ?? null,
      gitDirty: Boolean(request.gitDirty),
      objective: stringValue(request.objective) ?? null,
      completed: arrayValue(request.completed),
      blockers: arrayValue(request.blockers),
      nextSteps: arrayValue(request.nextSteps),
      modifiedFiles: arrayValue(request.modifiedFiles),
      verificationStatus: stringValue(request.verificationStatus) as any
    });

    const response: CreateCheckpointResponse = { checkpoint };
    return { body: response, status: 201 };
  }
}

export function canonicalProjectDirectoryKey(value: string): string {
  const resolved = path.resolve(value.trim()).replace(/[\\/]+$/, "") || path.parse(path.resolve(value.trim())).root;
  return process.platform === "win32" ? resolved.replaceAll("\\", "/").toLowerCase() : resolved;
}

function error(status: number, message: string): { body: ErrorResponse; status: number } {
  return {
    body: {
      error: {
        code: "continuity_request_invalid",
        message
      }
    },
    status
  };
}

function stringValue(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function arrayValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}

function boundedInteger(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = value === null ? NaN : Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

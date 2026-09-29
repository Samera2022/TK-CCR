import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createBetterSqliteDatabase, type BetterSqliteDatabase } from "@ccr/core/storage/sqlite-native";
import type { ProjectCheckpoint } from "./protocol";

type SqlValue = bigint | Buffer | number | string | null;

export class ContinuityStore {
  private readonly database: BetterSqliteDatabase;

  constructor(readonly dbFile: string) {
    if (dbFile !== ":memory:") {
      const directory = dirname(dbFile);
      mkdirSync(directory, { mode: 0o700, recursive: true });
      securePath(directory, 0o700);
    }

    this.database = createBetterSqliteDatabase(dbFile);
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("synchronous = NORMAL");
    this.database.pragma("busy_timeout = 5000");

    this.database.exec(`
      CREATE TABLE IF NOT EXISTS project_checkpoints (
        checkpoint_id TEXT PRIMARY KEY,
        project_directory TEXT NOT NULL,
        project_directory_key TEXT NOT NULL,
        client TEXT NOT NULL,

        git_branch TEXT,
        git_head_sha TEXT,
        git_dirty INTEGER NOT NULL DEFAULT 0,

        objective TEXT,
        completed_json TEXT NOT NULL,
        blockers_json TEXT NOT NULL,
        next_steps_json TEXT NOT NULL,
        modified_files_json TEXT NOT NULL,
        verification_status TEXT,

        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS checkpoints_project_branch
        ON project_checkpoints(project_directory_key, git_branch, updated_at DESC);

      CREATE INDEX IF NOT EXISTS checkpoints_client
        ON project_checkpoints(client, project_directory_key, updated_at DESC);
    `);

    this.database.pragma("foreign_keys = ON");
    securePath(dbFile, 0o600);
  }

  close(): void {
    this.database.close();
  }

  createCheckpoint(input: {
    id: string;
    projectDirectory: string;
    projectDirectoryKey: string;
    client: string;
    gitBranch: string | null;
    gitHeadSha: string | null;
    gitDirty: boolean;
    objective: string | null;
    completed: string[];
    blockers: string[];
    nextSteps: string[];
    modifiedFiles: string[];
    verificationStatus: "passed" | "pending" | "failed" | null;
  }): ProjectCheckpoint {
    const now = Date.now();

    this.database.prepare(`
      INSERT INTO project_checkpoints (
        checkpoint_id, project_directory, project_directory_key, client,
        git_branch, git_head_sha, git_dirty,
        objective, completed_json, blockers_json, next_steps_json,
        modified_files_json, verification_status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.projectDirectory,
      input.projectDirectoryKey,
      input.client,
      input.gitBranch ?? null,
      input.gitHeadSha ?? null,
      input.gitDirty ? 1 : 0,
      input.objective ?? null,
      JSON.stringify(input.completed),
      JSON.stringify(input.blockers),
      JSON.stringify(input.nextSteps),
      JSON.stringify(input.modifiedFiles),
      input.verificationStatus ?? null,
      now,
      now
    );

    return {
      id: input.id,
      projectDirectory: input.projectDirectory,
      projectDirectoryKey: input.projectDirectoryKey,
      client: input.client,
      gitBranch: input.gitBranch,
      gitHeadSha: input.gitHeadSha,
      gitDirty: input.gitDirty,
      objective: input.objective,
      completed: input.completed,
      blockers: input.blockers,
      nextSteps: input.nextSteps,
      modifiedFiles: input.modifiedFiles,
      verificationStatus: input.verificationStatus,
      createdAt: now,
      updatedAt: now
    };
  }

  getLatestCheckpoint(
    projectDirectoryKey: string,
    gitBranch?: string
  ): ProjectCheckpoint | undefined {
    const query = gitBranch
      ? `SELECT * FROM project_checkpoints
         WHERE project_directory_key = ? AND git_branch = ?
         ORDER BY updated_at DESC, rowid DESC LIMIT 1`
      : `SELECT * FROM project_checkpoints
         WHERE project_directory_key = ?
         ORDER BY updated_at DESC, rowid DESC LIMIT 1`;

    const params = gitBranch ? [projectDirectoryKey, gitBranch] : [projectDirectoryKey];
    const row = this.database.prepare(query).get(...params) as Record<string, SqlValue> | undefined;

    return row ? checkpointFromRow(row) : undefined;
  }

  listCheckpoints(
    projectDirectoryKey: string,
    limit: number
  ): ProjectCheckpoint[] {
    const rows = this.database.prepare(`
      SELECT * FROM project_checkpoints
      WHERE project_directory_key = ?
      ORDER BY updated_at DESC, rowid DESC
      LIMIT ?
    `).all(projectDirectoryKey, limit) as Array<Record<string, SqlValue>>;

    return rows.map(checkpointFromRow);
  }

  getCheckpoint(id: string): ProjectCheckpoint | undefined {
    const row = this.database.prepare(
      "SELECT * FROM project_checkpoints WHERE checkpoint_id = ? LIMIT 1"
    ).get(id) as Record<string, SqlValue> | undefined;

    return row ? checkpointFromRow(row) : undefined;
  }
}

function checkpointFromRow(row: Record<string, SqlValue>): ProjectCheckpoint {
  return {
    id: requiredString(row.checkpoint_id),
    projectDirectory: requiredString(row.project_directory),
    projectDirectoryKey: requiredString(row.project_directory_key),
    client: requiredString(row.client),
    gitBranch: optionalString(row.git_branch),
    gitHeadSha: optionalString(row.git_head_sha),
    gitDirty: Boolean(row.git_dirty),
    objective: optionalString(row.objective),
    completed: parseJsonArray(row.completed_json),
    blockers: parseJsonArray(row.blockers_json),
    nextSteps: parseJsonArray(row.next_steps_json),
    modifiedFiles: parseJsonArray(row.modified_files_json),
    verificationStatus: optionalString(row.verification_status) as any,
    createdAt: requiredNumber(row.created_at),
    updatedAt: requiredNumber(row.updated_at)
  };
}

function requiredString(value: SqlValue): string {
  if (typeof value !== "string") {
    throw new Error("Continuity database contains an invalid string value.");
  }
  return value;
}

function optionalString(value: SqlValue): string | null {
  return typeof value === "string" && value ? value : null;
}

function requiredNumber(value: SqlValue): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error("Continuity database contains an invalid number value.");
  }
  return number;
}

function parseJsonArray(value: SqlValue): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function securePath(file: string, mode: number): void {
  if (process.platform === "win32" || !existsSync(file)) return;
  try {
    chmodSync(file, mode);
  } catch {
    // Best-effort hardening for filesystems without POSIX permissions.
  }
}

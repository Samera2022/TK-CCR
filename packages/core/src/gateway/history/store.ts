import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createBetterSqliteDatabase, type BetterSqliteDatabase } from "@ccr/core/storage/sqlite-native";

export type HistoryMessage = {
  content: unknown;
  createdAt: number;
  id: string;
  metadata?: Record<string, unknown>;
  role: string;
  source?: string;
};

export type HistoryThread = {
  client?: string;
  createdAt: number;
  id: string;
  metadata: Record<string, unknown>;
  projectDirectory: string;
  title: string;
  updatedAt: number;
};

type SqlValue = bigint | Buffer | number | string | null;

export class HistoryStore {
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
      CREATE TABLE IF NOT EXISTS history_threads (
        thread_id TEXT PRIMARY KEY,
        project_directory TEXT NOT NULL,
        project_directory_key TEXT NOT NULL,
        client TEXT,
        title TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS history_threads_project
        ON history_threads(project_directory_key, updated_at DESC);
      CREATE TABLE IF NOT EXISTS history_messages (
        message_id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES history_threads(thread_id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content_json TEXT NOT NULL,
        metadata_json TEXT,
        source TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS history_messages_thread
        ON history_messages(thread_id, created_at ASC);
    `);
    this.database.pragma("foreign_keys = ON");
    securePath(dbFile, 0o600);
  }

  close(): void {
    this.database.close();
  }

  createThread(input: {
    client?: string;
    id: string;
    metadata?: Record<string, unknown>;
    projectDirectory: string;
    projectDirectoryKey: string;
    title?: string;
  }): HistoryThread {
    const now = Date.now();
    const title = input.title?.trim() || "Untitled conversation";
    this.database.prepare(`
      INSERT INTO history_threads (
        thread_id, project_directory, project_directory_key, client, title,
        metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.projectDirectory,
      input.projectDirectoryKey,
      input.client ?? null,
      title,
      JSON.stringify(input.metadata ?? {}),
      now,
      now
    );
    return {
      client: input.client,
      createdAt: now,
      id: input.id,
      metadata: input.metadata ?? {},
      projectDirectory: input.projectDirectory,
      title,
      updatedAt: now
    };
  }

  getThread(id: string): HistoryThread | undefined {
    const row = this.database.prepare("SELECT * FROM history_threads WHERE thread_id = ? LIMIT 1").get(id) as Record<string, SqlValue> | undefined;
    return row ? threadFromRow(row) : undefined;
  }

  listThreads(projectDirectoryKey: string, limit: number): HistoryThread[] {
    const rows = this.database.prepare(`
      SELECT * FROM history_threads
      WHERE project_directory_key = ?
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(projectDirectoryKey, limit) as Array<Record<string, SqlValue>>;
    return rows.map(threadFromRow);
  }

  appendMessage(input: Omit<HistoryMessage, "createdAt"> & { threadId: string }): HistoryMessage {
    const createdAt = Date.now();
    this.database.transaction(() => {
      this.database.prepare(`
        INSERT INTO history_messages (
          message_id, thread_id, role, content_json, metadata_json, source, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.id,
        input.threadId,
        input.role,
        JSON.stringify(input.content),
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.source ?? null,
        createdAt
      );
      this.database.prepare("UPDATE history_threads SET updated_at = ? WHERE thread_id = ?").run(createdAt, input.threadId);
    })();
    return { ...input, createdAt };
  }

  listMessages(threadId: string, limit: number, offset: number): HistoryMessage[] {
    const rows = this.database.prepare(`
      SELECT * FROM history_messages
      WHERE thread_id = ?
      ORDER BY created_at ASC, message_id ASC
      LIMIT ? OFFSET ?
    `).all(threadId, limit, offset) as Array<Record<string, SqlValue>>;
    return rows.map(messageFromRow);
  }
}

function threadFromRow(row: Record<string, SqlValue>): HistoryThread {
  return {
    client: optionalString(row.client),
    createdAt: requiredNumber(row.created_at),
    id: requiredString(row.thread_id),
    metadata: parseRecord(row.metadata_json),
    projectDirectory: requiredString(row.project_directory),
    title: requiredString(row.title),
    updatedAt: requiredNumber(row.updated_at)
  };
}

function messageFromRow(row: Record<string, SqlValue>): HistoryMessage {
  return {
    content: JSON.parse(requiredString(row.content_json)) as unknown,
    createdAt: requiredNumber(row.created_at),
    id: requiredString(row.message_id),
    ...(optionalRecord(row.metadata_json) ? { metadata: optionalRecord(row.metadata_json) } : {}),
    role: requiredString(row.role),
    ...(optionalString(row.source) ? { source: optionalString(row.source) } : {})
  };
}

function parseRecord(value: SqlValue): Record<string, unknown> {
  return optionalRecord(value) ?? {};
}

function optionalRecord(value: SqlValue): Record<string, unknown> | undefined {
  const text = optionalString(value);
  if (!text) return undefined;
  const parsed = JSON.parse(text) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
}

function requiredString(value: SqlValue): string {
  const text = optionalString(value);
  if (!text) throw new Error("History database contains an invalid string value.");
  return text;
}

function optionalString(value: SqlValue): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function requiredNumber(value: SqlValue): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("History database contains an invalid number value.");
  return number;
}

function securePath(file: string, mode: number): void {
  if (process.platform === "win32" || !existsSync(file)) return;
  try {
    chmodSync(file, mode);
  } catch {
    // Best-effort hardening for filesystems without POSIX permissions.
  }
}

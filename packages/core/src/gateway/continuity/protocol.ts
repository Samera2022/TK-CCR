/**
 * Project Continuity Protocol
 *
 * Provides cross-agent project state synchronization for Codex and DeepSeek Harness.
 */

export type ProjectCheckpoint = {
  /** Unique checkpoint ID (chk_xxx) */
  id: string;

  /** Project directory path */
  projectDirectory: string;

  /** Normalized project directory key for indexing */
  projectDirectoryKey: string;

  /** Client identifier: "codex" | "deepseek-harness" */
  client: string;

  /** Git branch name (null if not a git repo) */
  gitBranch: string | null;

  /** Git HEAD SHA (null if not a git repo) */
  gitHeadSha: string | null;

  /** Whether working tree has uncommitted changes */
  gitDirty: boolean;

  /** Current task objective */
  objective: string | null;

  /** Completed work items */
  completed: string[];

  /** Blocking issues */
  blockers: string[];

  /** Planned next steps */
  nextSteps: string[];

  /** Modified file paths */
  modifiedFiles: string[];

  /** Verification status */
  verificationStatus: "passed" | "pending" | "failed" | null;

  /** Creation timestamp (Unix milliseconds) */
  createdAt: number;

  /** Last update timestamp (Unix milliseconds) */
  updatedAt: number;
};

export type GitState = {
  /** Current branch name */
  branch: string | null;

  /** HEAD commit SHA */
  headSha: string | null;

  /** Whether working tree is dirty */
  dirty: boolean;
};

export type DriftStatus =
  | { type: "clean" }
  | { type: "dirty_files" }
  | { type: "different_head"; oldSha: string; newSha: string }
  | { type: "different_branch"; oldBranch: string; newBranch: string }
  | { type: "git_unavailable" };

export type CreateCheckpointRequest = {
  id?: string;
  projectDirectory: string;
  client?: string;
  gitBranch?: string;
  gitHeadSha?: string;
  gitDirty?: boolean;
  objective?: string;
  completed?: string[];
  blockers?: string[];
  nextSteps?: string[];
  modifiedFiles?: string[];
  verificationStatus?: "passed" | "pending" | "failed";
};

export type CreateCheckpointResponse = {
  checkpoint: ProjectCheckpoint;
};

export type GetLatestCheckpointRequest = {
  projectDirectory: string;
  gitBranch?: string;
};

export type GetLatestCheckpointResponse = {
  checkpoint: ProjectCheckpoint | null;
};

export type ListCheckpointsRequest = {
  projectDirectory: string;
  limit?: number;
};

export type ListCheckpointsResponse = {
  checkpoints: ProjectCheckpoint[];
};

export type ErrorResponse = {
  error: {
    code: string;
    message: string;
  };
};

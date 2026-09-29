import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DriftStatus, GitState, ProjectCheckpoint } from "./protocol";

/**
 * Capture current Git state of a project directory
 */
export function captureGitState(projectDirectory: string): GitState {
  try {
    // Check if .git exists
    if (!existsSync(join(projectDirectory, ".git"))) {
      return { branch: null, headSha: null, dirty: false };
    }

    // Get current branch
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: projectDirectory,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();

    // Get HEAD SHA
    const headSha = execSync("git rev-parse HEAD", {
      cwd: projectDirectory,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();

    // Check for uncommitted changes
    const status = execSync("git status --porcelain", {
      cwd: projectDirectory,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const dirty = status.length > 0;

    return { branch, headSha, dirty };
  } catch {
    // Git command failed or not a git repo
    return { branch: null, headSha: null, dirty: false };
  }
}

/**
 * Check drift between checkpoint Git state and current Git state
 */
export function checkDrift(
  checkpoint: Pick<ProjectCheckpoint, "gitBranch" | "gitHeadSha" | "gitDirty">,
  current: GitState
): DriftStatus {
  // Git not available
  if (current.branch === null || current.headSha === null) {
    return { type: "git_unavailable" };
  }

  // Branch changed
  if (checkpoint.gitBranch !== null && checkpoint.gitBranch !== current.branch) {
    return {
      type: "different_branch",
      oldBranch: checkpoint.gitBranch,
      newBranch: current.branch
    };
  }

  // HEAD changed
  if (checkpoint.gitHeadSha !== null && checkpoint.gitHeadSha !== current.headSha) {
    return {
      type: "different_head",
      oldSha: checkpoint.gitHeadSha,
      newSha: current.headSha
    };
  }

  // Working tree dirty
  if (current.dirty) {
    return { type: "dirty_files" };
  }

  // Clean
  return { type: "clean" };
}

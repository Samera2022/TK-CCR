/**
 * Project Continuity Module
 *
 * Provides cross-agent project state synchronization for Codex and DeepSeek Harness.
 */

export { ContinuityStore } from "./store";
export { ContinuityService, continuityPathPrefix, canonicalProjectDirectoryKey } from "./service";
export { assessDrift, captureGitState, checkDrift } from "./git-state";
export type {
  ProjectCheckpoint,
  GitState,
  DriftStatus,
  DriftConfidence,
  DriftAssessment,
  DriftAssessmentResponse,
  RefreshCheckpointRequest,
  CreateCheckpointRequest,
  CreateCheckpointResponse,
  GetLatestCheckpointRequest,
  GetLatestCheckpointResponse,
  ListCheckpointsRequest,
  ListCheckpointsResponse,
  ErrorResponse
} from "./protocol";

import assert from "node:assert/strict";
import test from "node:test";
import { checkDrift } from "@ccr/core/gateway/continuity/git-state";
import { ContinuityService } from "@ccr/core/gateway/continuity/service";
import { ContinuityStore } from "@ccr/core/gateway/continuity/store";

test("continuity drift detection distinguishes clean, dirty, head, branch, and unavailable states", () => {
  const checkpoint = { gitBranch: "main", gitHeadSha: "abc123", gitDirty: false };
  assert.deepEqual(checkDrift(checkpoint, { branch: "main", headSha: "abc123", dirty: false }), { type: "clean" });
  assert.deepEqual(checkDrift(checkpoint, { branch: "main", headSha: "abc123", dirty: true }), { type: "dirty_files" });
  assert.deepEqual(checkDrift(checkpoint, { branch: "main", headSha: "def456", dirty: false }), {
    type: "different_head",
    oldSha: "abc123",
    newSha: "def456"
  });
  assert.deepEqual(checkDrift(checkpoint, { branch: "feature/test", headSha: "def456", dirty: false }), {
    type: "different_branch",
    oldBranch: "main",
    newBranch: "feature/test"
  });
  assert.deepEqual(checkDrift(checkpoint, { branch: null, headSha: null, dirty: false }), { type: "git_unavailable" });
});

test("continuity store creates and retrieves the latest checkpoint by canonical project and branch", () => {
  const store = new ContinuityStore(":memory:");
  try {
    const base = {
      projectDirectory: "/tmp/toolkit",
      projectDirectoryKey: "/tmp/toolkit",
      client: "codex",
      gitBranch: "main",
      gitHeadSha: "abc123",
      gitDirty: false,
      objective: "Continue implementation",
      completed: ["CCR scaffold"],
      blockers: [],
      nextSteps: ["Add client"],
      modifiedFiles: ["service.ts"],
      verificationStatus: "passed"
    };
    store.createCheckpoint({ ...base, id: "chk_old" });
    store.createCheckpoint({ ...base, id: "chk_new", objective: "Continue with client" });

    const latest = store.getLatestCheckpoint("/tmp/toolkit", "main");
    assert.equal(latest?.id, "chk_new");
    assert.equal(latest?.objective, "Continue with client");
    assert.deepEqual(store.listCheckpoints("/tmp/toolkit", 1).map((item) => item.id), ["chk_new"]);
  } finally {
    store.close();
  }
});

test("continuity service exposes checkpoint and git-state endpoints", () => {
  const service = new ContinuityService(new ContinuityStore(":memory:"));
  try {
    const created = service.handleRequest({
      body: {
        projectDirectory: "/tmp/toolkit",
        client: "codex",
        gitBranch: "main",
        objective: "Test objective"
      },
      method: "POST",
      url: "/__ccr/continuity/v1/checkpoints"
    });
    assert.equal(created.status, 201);
    assert.match(created.body.checkpoint.id, /^chk_/);

    const latest = service.handleRequest({
      body: {},
      method: "GET",
      url: "/__ccr/continuity/v1/checkpoints/latest?projectDirectory=/tmp/toolkit&gitBranch=main"
    });
    assert.equal(latest.status, 200);
    assert.equal(latest.body.checkpoint.objective, "Test objective");

    const gitState = service.handleRequest({
      body: {},
      method: "GET",
      url: "/__ccr/continuity/v1/git-state?projectDirectory=/tmp"
    });
    assert.equal(gitState.status, 200);
    assert.deepEqual(gitState.body.gitState, { branch: null, headSha: null, dirty: false });
  } finally {
    service.close();
  }
});

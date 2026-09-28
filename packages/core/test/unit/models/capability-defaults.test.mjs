import assert from "node:assert/strict";
import test from "node:test";
import { applyGeneralModelCapabilityDefaults, generalModelCapabilities } from "@ccr/core/models/capability-defaults";

test("general model capability defaults cover common model families", () => {
  assert.equal(generalModelCapabilities("gpt-4o").imageInput, true);
  assert.equal(generalModelCapabilities("deepseek-reasoner").reasoning, true);
  assert.equal(generalModelCapabilities("unknown-model").toolUse, true);
});

test("explicit provider metadata overrides general defaults", () => {
  const metadata = applyGeneralModelCapabilityDefaults(["gpt-4o"], {
    "gpt-4o": { capabilities: { imageInput: false } }
  });
  assert.equal(metadata["gpt-4o"].capabilities?.imageInput, false);
  assert.equal(metadata["gpt-4o"].capabilities?.toolUse, true);
});

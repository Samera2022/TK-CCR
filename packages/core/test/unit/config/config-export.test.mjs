import assert from "node:assert/strict";
import test from "node:test";
import { createPortableConfigExport } from "@ccr/core/config/config-export";

const config = {
  integrations: {
    mcpServers: [],
    skills: []
  },
  profile: {
    codex: {
      configFile: "C:\\Users\\demo\\.codex\\config.toml"
    }
  },
  Providers: [{ name: "demo", api_key: "secret" }]
};

test("portable config export excludes runtime and conversation data", () => {
  const payload = createPortableConfigExport(config);
  assert.equal(payload.kind, "claude-code-router-config-export");
  assert.deepEqual(payload.excludedData, ["history", "request-logs", "usage-statistics", "runtime-databases"]);
  assert.equal(payload.pathFormat, "portable-posix");
  assert.equal(payload.config.profile.codex.configFile, "C:/Users/demo/.codex/config.toml");
  assert.equal(payload.config.Providers[0].api_key, "secret");
  assert.equal("files" in payload, false);
});

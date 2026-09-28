import type { AppConfig, CcrConfigExport } from "@ccr/core/contracts/app";

const pathKeys = new Set([
  "allowedInputRoots", "configFile", "codexCliPath", "codexHome", "cwd", "customRouterPath",
  "settingsFile", "sourceDir", "stateDir", "storagePath"
]);

export function createPortableConfigExport(config: AppConfig, exportedAt = new Date().toISOString()): CcrConfigExport {
  return {
    config: normalizePortablePaths(structuredClone(config)) as AppConfig,
    excludedData: ["history", "request-logs", "usage-statistics", "runtime-databases"],
    exportedAt,
    kind: "claude-code-router-config-export",
    pathFormat: "portable-posix",
    version: 2
  };
}

function normalizePortablePaths(value: unknown, key?: string): unknown {
  if (typeof value === "string" && key && pathKeys.has(key)) {
    return value.replaceAll("\\", "/");
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizePortablePaths(item, key));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [
    childKey,
    normalizePortablePaths(childValue, childKey)
  ]));
}

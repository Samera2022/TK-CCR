import {
  CLAUDE_CODE_DEFAULT_ENV,
  DEFAULT_OVERVIEW_WIDGETS,
  DEFAULT_TRAY_COMPONENT_VARIANTS,
  DEFAULT_TRAY_WIDGETS,
  DEFAULT_TRAY_WINDOW_MODULES,
  type AppConfig,
  type ProxyRouteTarget
} from "@ccr/core/contracts/app";
import { defaultRequestLogBodyBytes } from "@ccr/core/observability/request-log-limits";

const DEFAULT_ORCHESTRA_ROLES = [
  {
    name: "cost-effective-primary",
    model: "deepseek-v4.1-flash",
    systemPrompt: "Read source material, organize hypotheses, write experiment code, and produce initial derivations. Prefer concise, evidence-backed progress.",
    triggers: ["read", "summarize", "hypothesis", "experiment", "prototype", "原文", "假设", "实验", "初步推导"]
  },
  {
    name: "structured-drafter",
    model: "glm-5.3-flash",
    systemPrompt: "整理大量资料，提取结构化信息，并起草代码和文档初稿。",
    triggers: ["整理", "提取", "结构化", "draft", "documentation", "资料", "文档初稿"]
  },
  {
    name: "second-opinion",
    model: "glm-5.3",
    systemPrompt: "提供第二意见，分析文献材料，并处理工具型任务。指出不确定性和相反证据。",
    triggers: ["second opinion", "review", "literature", "文献", "第二意见", "工具型"]
  },
  {
    name: "openai-reasoning",
    model: "gpt-6-sol",
    systemPrompt: "在 OpenAI 体系内完成需要更强推理但范围仍可控的任务；先明确问题边界，再给出可验证结论。",
    triggers: ["reasoning", "architecture", "design", "推理", "架构", "设计"]
  },
  {
    name: "high-value-hard-problem",
    model: "gpt-6-astra",
    systemPrompt: "只处理高价值、范围明确且需要深度推理的难题；先验证任务值得使用高成本模型。",
    triggers: ["hard problem", "deep reasoning", "critical", "高价值", "明确范围", "难题"]
  }
];

export const DEFAULT_PROXY_TARGETS: ProxyRouteTarget[] = [
  { host: "api.anthropic.com", paths: ["/v1/messages", "/v1/messages/count_tokens"] },
  { host: "api.openai.com", paths: ["/v1/chat/completions", "/v1/responses", "/v1/models"] },
  { host: "generativelanguage.googleapis.com", paths: ["/v1beta/models", "/v1/models"] },
  { host: "openrouter.ai", paths: ["/api/v1/chat/completions", "/api/v1/responses", "/api/v1/models"] },
  { host: "api.deepseek.com", paths: ["/chat/completions", "/v1/chat/completions", "/models", "/v1/models"] },
  { host: "api.mistral.ai", paths: ["/v1/chat/completions", "/v1/models"] }
];

export type DefaultAppConfigOptions = {
  coreHost?: string;
};

export function createDefaultAppConfig(options: DefaultAppConfigOptions = {}): AppConfig {
  const coreHost = options.coreHost ?? "127.0.0.1";
  return {
    APIKEY: "",
    APIKEYS: [],
    API_TIMEOUT_MS: 600000,
    CUSTOM_ROUTER_PATH: "",
    HOST: "127.0.0.1",
    PORT: 3456,
    Providers: [],
    Router: {
      builtInRules: {
        "claude-code": {
          enabled: true
        },
        codex: {
          enabled: true
        }
      },
      fallback: {
        mode: "off",
        models: [],
        retryCount: 1
      },
      orderLists: {},
      rules: []
    },
    agent: {
      mcpServers: []
    },
    autoStart: false,
    botConfigs: [],
    botGateway: {
      acknowledgeEvents: false,
      args: [],
      authType: "",
      autoStartIntegration: true,
      command: "",
      createIntegration: false,
      credentials: {},
      cwd: "",
      enabled: false,
      forwardAllAgentMessages: true,
      handoff: {
        enabled: false,
        idleSeconds: 30,
        phoneBluetoothTargets: [],
        phoneWifiTargets: [],
        screenLock: true,
        userIdle: true
      },
      integrationConfig: {},
      integrationId: "",
      language: "auto",
      maxAttachmentBytes: 20 * 1024 * 1024,
      maxTurnTimeMs: 10 * 60 * 1000,
      mediaEnabled: true,
      messageChunkChars: 3500,
      platform: "none",
      pollIntervalMs: 2000,
      requestTimeoutMs: 600000,
      sessionIdleMinutes: 0,
      shellEnabled: false,
      sourceDir: "",
      startupTimeoutMs: 10000,
      stateDir: "",
      streamReplies: false,
      tenantId: "ccr"
    },
    contextArchive: {
      enabled: false,
      maxBytes: 512 * 1024 * 1024,
      maxSnapshotBytes: 32 * 1024 * 1024,
      maxSnapshots: 200,
      mcpEnabled: true,
      replayTimeoutMs: 60000,
      retentionDays: 30,
      storagePath: "",
      toolName: "ccr_history_ask"
    },
    integrations: {
      mcpServers: [],
      skills: []
    },
    gateway: {
      coreHost,
      corePort: 3457,
      enabled: true,
      host: "127.0.0.1",
      port: 3456
    },
    mediaTools: {
      allowedInputRoots: [],
      artifactTtlHours: 24,
      enabled: false,
      jobTimeoutMs: 600000,
      maxImageConcurrency: 2,
      maxVideoConcurrency: 1
    },
    modelBudget: {
      defaultBudget: 1_000_000,
      warningThreshold: 90,
      models: {}
    },
    orchestra: {
      enabled: false,
      defaultOrchestratorModel: "gpt-6-sol",
      roles: DEFAULT_ORCHESTRA_ROLES.map((role) => ({ ...role }))
    },
    reasoning: {
      enabled: true,
      defaultEffort: "",
      models: {}
    },
    launchAtLogin: false,
    observability: {
      agentAnalysis: false,
      requestLogBodyCapture: "all",
      requestLogMaxBodyBytes: defaultRequestLogBodyBytes,
      requestLogSuccessSampleRate: 1,
      requestLogs: false
    },
    preferredProvider: "",
    plugins: [],
    profile: {
      claudeCode: {
        enabled: true,
        fableModel: "",
        haikuModel: "",
        managedCompact: false,
        model: "",
        opusModel: "",
        settingsFile: "~/.claude/settings.json",
        sonnetModel: "",
        smallFastModel: ""
      },
      codex: {
        cliMiddleware: true,
        codexCliPath: "",
        codexHome: "",
        configFormat: "separate_profile_files",
        configFile: "~/.codex/config.toml",
        enabled: true,
        managedCompact: false,
        model: "",
        providerId: "claude-code-router",
        providerName: "Claude Code Router",
        showAllSessions: false
      },
      enabled: true,
      profiles: [
        {
          agent: "claude-code",
          enabled: true,
          env: { ...CLAUDE_CODE_DEFAULT_ENV },
          fableModel: "",
          haikuModel: "",
          id: "default-claude-code",
          managedCompact: false,
          model: "",
          name: "Claude Code",
          opusModel: "",
          scope: "global",
          settingsFile: "~/.claude/settings.json",
          sonnetModel: "",
          smallFastModel: "",
          surface: "auto"
        },
        {
          agent: "codex",
          cliMiddleware: true,
          codexCliPath: "",
          codexHome: "",
          configFormat: "separate_profile_files",
          configFile: "~/.codex/config.toml",
          enabled: true,
          env: {},
          id: "default-codex",
          managedCompact: false,
          model: "",
          name: "Codex",
          providerId: "claude-code-router",
          providerName: "Claude Code Router",
          showAllSessions: false,
          scope: "global",
          surface: "auto"
        }
      ]
    },
    proxy: {
      browserMode: true,
      captureNetwork: false,
      enabled: false,
      host: "127.0.0.1",
      mode: "gateway",
      port: 7890,
      systemProxy: false,
      targets: DEFAULT_PROXY_TARGETS,
      upstream: {
        custom: {
          password: "",
          port: 7890,
          server: "",
          username: ""
        },
        mode: "system"
      }
    },
    providerPlugins: [],
    overviewWidgets: DEFAULT_OVERVIEW_WIDGETS,
    routerEndpoint: "http://127.0.0.1:3456",
    theme: "system",
    trayComponentVariants: DEFAULT_TRAY_COMPONENT_VARIANTS,
    trayIcon: "random",
    trayShowTokenRate: false,
    trayProgressTargetTokens: 100000,
    trayWidgets: DEFAULT_TRAY_WIDGETS,
    trayWindowModules: DEFAULT_TRAY_WINDOW_MODULES,
    toolHub: {
      browserAutomation: false,
      enabled: false,
      llm: {
        apiKey: "",
        baseUrl: "https://api.openai.com/v1",
        model: ""
      },
      mcpServers: [],
      maxTools: 10,
      requestTimeoutMs: 60000
    },
    virtualModelProfiles: []
  };
}

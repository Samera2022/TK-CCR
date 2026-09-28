import { useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronRight, CircleDot, Download, FileJson, FolderOpen, History, Layers3, RefreshCw, Search, ShieldCheck, Sparkles, Wrench, X } from "lucide-react";
import type { AppConfig, ProviderModelCapabilities, ProviderModelMetadata } from "@ccr/core/contracts/app";
import { generalModelCapabilities } from "@ccr/core/models/capability-defaults";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { IntegrationsView } from "./integrations";

export type ControlCenterTab = "history" | "rectifier" | "capabilities" | "integrations" | "export";

type HistoryThread = {
  client?: string;
  createdAt: number;
  id: string;
  projectDirectory: string;
  title: string;
  updatedAt: number;
};

type HistoryMessage = {
  content: unknown;
  createdAt: number;
  id: string;
  role: string;
};

const capabilityLabels: Array<{ key: keyof ProviderModelCapabilities; label: string; short: string }> = [
  { key: "textInput", label: "文本", short: "TXT" },
  { key: "imageInput", label: "图像", short: "IMG" },
  { key: "audioInput", label: "音频", short: "AUD" },
  { key: "toolUse", label: "工具", short: "TOOL" },
  { key: "structuredOutput", label: "结构化", short: "JSON" },
  { key: "reasoning", label: "推理", short: "R" },
  { key: "webSearch", label: "搜索", short: "WEB" }
];

export function ControlCenterView({ config, initialTab = "history", onChange }: {
  config: AppConfig;
  initialTab?: ControlCenterTab;
  onChange: (config: AppConfig) => void;
}) {
  const [tab, setTab] = useState<ControlCenterTab>(initialTab);
  const tabItems = [
    { id: "history" as const, label: "统一历史", icon: History, detail: "Codex · DeepSeek Harness" },
    { id: "rectifier" as const, label: "错误整流", icon: ShieldCheck, detail: "响应兼容层" },
    { id: "capabilities" as const, label: "模型能力", icon: Sparkles, detail: `${config.Providers.length} 个 Provider` },
    { id: "integrations" as const, label: "Skills / MCP", icon: Wrench, detail: `${config.integrations.skills.length} Skills · ${config.integrations.mcpServers.length} MCP` },
    { id: "export" as const, label: "配置迁移", icon: Download, detail: "不含历史记录" }
  ];

  return (
    <div className="mx-auto grid w-full max-w-[1180px] gap-5">
      <header className="relative overflow-hidden rounded-2xl border border-border bg-card px-6 py-6 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary"><CircleDot className="h-3.5 w-3.5" /> CCR Control Center</div>
            <h1 className="text-[24px] font-semibold tracking-[-0.03em]">能力与迁移中心</h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-5 text-muted-foreground">把多客户端共享、模型能力和运行时兼容策略放在同一处管理。配置保存后会沿用现有 CCR 工作台的持久化流程。</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-[12px] text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> 配置实时同步
          </div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="能力中心导航" className="grid content-start gap-1 rounded-xl border border-border bg-card p-2 shadow-sm">
          {tabItems.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return <button className={cn("group flex items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors", active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground")} key={item.id} onClick={() => setTab(item.id)} type="button">
              <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md", active ? "bg-white/15" : "bg-muted/70 group-hover:bg-background")}><Icon className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium">{item.label}</span><span className={cn("mt-0.5 block truncate text-[11px]", active ? "text-primary-foreground/70" : "text-muted-foreground/75")}>{item.detail}</span></span>
              <ChevronRight className={cn("mt-1 h-3.5 w-3.5", active ? "opacity-100" : "opacity-0 group-hover:opacity-60")} />
            </button>;
          })}
        </nav>

        <main className="min-w-0">
          {tab === "history" ? <HistoryPanel config={config} /> : null}
          {tab === "rectifier" ? <RectifierPanel /> : null}
          {tab === "capabilities" ? <CapabilitiesPanel config={config} onChange={onChange} /> : null}
          {tab === "integrations" ? <IntegrationsView config={config} onChange={(integrations) => onChange({ ...config, integrations })} /> : null}
          {tab === "export" ? <ExportPanel /> : null}
        </main>
      </div>
    </div>
  );
}

function HistoryPanel({ config }: { config: AppConfig }) {
  const [projectDirectory, setProjectDirectory] = useState("");
  const [threads, setThreads] = useState<HistoryThread[]>([]);
  const [selected, setSelected] = useState<HistoryThread | undefined>();
  const [messages, setMessages] = useState<HistoryMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadThreads() {
    const directory = projectDirectory.trim();
    if (!directory) return;
    setLoading(true); setError("");
    try {
      const url = new URL("/__ccr/history/v1/threads", config.routerEndpoint);
      url.searchParams.set("project_directory", directory);
      const response = await fetch(url, { headers: config.APIKEY ? { Authorization: `Bearer ${config.APIKEY}` } : undefined });
      if (!response.ok) throw new Error(`历史服务返回 HTTP ${response.status}`);
      const payload = await response.json() as { threads?: HistoryThread[] };
      setThreads(payload.threads ?? []); setSelected(undefined); setMessages([]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "无法读取统一历史。"); }
    finally { setLoading(false); }
  }

  async function openThread(thread: HistoryThread) {
    setSelected(thread); setError("");
    try {
      const url = new URL(`/__ccr/history/v1/threads/${encodeURIComponent(thread.id)}/messages`, config.routerEndpoint);
      const response = await fetch(url, { headers: config.APIKEY ? { Authorization: `Bearer ${config.APIKEY}` } : undefined });
      if (!response.ok) throw new Error(`消息读取失败：HTTP ${response.status}`);
      const payload = await response.json() as { messages?: HistoryMessage[] };
      setMessages(payload.messages ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "无法读取消息。"); }
  }

  return <div className="grid gap-4">
    <SectionIntro icon={History} title="统一历史记录" description="按项目目录聚合多个客户端的线程，Codex 与 DeepSeek Harness 可以在同一项目下继续工作。" badge="按项目目录共享" />
    <Card><CardContent className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="relative"><FolderOpen className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" onChange={(event) => setProjectDirectory(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadThreads(); }} placeholder="输入项目目录，例如 /home/me/project 或 C:/work/project" value={projectDirectory} /></div>
      <Button disabled={loading || !projectDirectory.trim()} onClick={() => void loadThreads()}><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />加载线程</Button>
    </CardContent></Card>
    <div className="grid min-h-[360px] gap-4 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)]">
      <Card><CardHeader><CardTitle className="flex items-center justify-between">项目线程 <Badge variant="secondary">{threads.length}</Badge></CardTitle></CardHeader><CardContent className="p-2">
        {threads.length === 0 ? <EmptyState icon={FolderOpen} title="还没有加载线程" detail="输入一个项目目录开始查看共享历史。" /> : <div className="grid gap-1">{threads.map((thread) => <button className={cn("rounded-lg px-3 py-3 text-left hover:bg-muted/70", selected?.id === thread.id && "bg-primary/10 ring-1 ring-primary/20")} key={thread.id} onClick={() => void openThread(thread)} type="button"><div className="truncate text-[13px] font-medium">{thread.title}</div><div className="mt-1 flex gap-2 text-[11px] text-muted-foreground"><span>{thread.client || "未知客户端"}</span><span>·</span><span>{new Date(thread.updatedAt).toLocaleString()}</span></div></button>)}</div>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>{selected?.title || "消息预览"}</CardTitle></CardHeader><CardContent className="p-4"><div className="mb-3 flex items-center gap-2 text-[11px] text-muted-foreground"><span className="h-2 w-2 rounded-full bg-emerald-500" />同一项目可被多个客户端继续使用</div>{messages.length === 0 ? <EmptyState icon={History} title="选择一个线程" detail="消息会在这里按时间顺序显示。" /> : <div className="grid gap-3">{messages.map((message) => <div className={cn("rounded-lg border px-3 py-2.5 text-[12px] leading-5", message.role === "user" ? "ml-8 border-primary/20 bg-primary/5" : "mr-8 border-border bg-muted/30")} key={message.id}><div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{message.role}</div><div className="whitespace-pre-wrap break-words">{formatMessageContent(message.content)}</div></div>)}</div>}</CardContent></Card>
    </div>
    {error ? <InlineError>{error}</InlineError> : null}
  </div>;
}

function RectifierPanel() {
  return <div className="grid gap-4"><SectionIntro icon={ShieldCheck} title="错误整流" description="把不同中转站返回的错误格式统一为 CCR 标准 envelope，方便客户端稳定识别和展示。" badge="基础整流已启用" />
    <div className="grid gap-4 md:grid-cols-3"><MetricCard label="当前状态" value="Active" detail="响应错误自动归一化" tone="success" /><MetricCard label="统一字段" value="4" detail="message · type · code · provider" /><MetricCard label="扩展方式" value="Registry" detail="可按 Provider 注册规则" /></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Layers3 className="h-4 w-4 text-primary" />整流链路</CardTitle></CardHeader><CardContent className="grid gap-2 p-4 sm:grid-cols-3">{["识别上游错误", "执行 Provider 规则", "生成标准响应"].map((step, index) => <div className="relative rounded-lg border border-border bg-muted/20 p-3" key={step}><div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[12px] font-semibold text-primary">0{index + 1}</div><div className="text-[12px] font-medium">{step}</div><div className="mt-1 text-[11px] text-muted-foreground">{index === 1 ? "当前规则注册表为空，遇到兼容问题时可扩展。" : "由 CCR 网关自动处理。"}</div></div>)}</CardContent></Card>
    <Card><CardHeader><CardTitle>规则扩展入口</CardTitle></CardHeader><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><div><div className="text-[13px] font-medium">Provider-specific rectifier</div><div className="mt-1 text-[12px] text-muted-foreground">后续可以在这里查看命中次数、测试样例和启停规则。</div></div><Badge variant="outline">Coming next</Badge></CardContent></Card>
  </div>;
}

function CapabilitiesPanel({ config, onChange }: { config: AppConfig; onChange: (config: AppConfig) => void }) {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => config.Providers.flatMap((provider) => provider.models.map((model) => ({ metadata: provider.modelMetadata?.[model], model, provider }))).filter(({ model, provider }) => `${provider.name}/${model}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 80), [config.Providers, query]);
  function update(providerName: string, model: string, key: keyof ProviderModelCapabilities, value: boolean) {
    onChange({ ...config, Providers: config.Providers.map((provider) => provider.name !== providerName ? provider : { ...provider, modelMetadata: { ...(provider.modelMetadata ?? {}), [model]: { ...(provider.modelMetadata?.[model] ?? {}), capabilities: { ...(provider.modelMetadata?.[model]?.capabilities ?? {}), [key]: value } } } }) });
  }
  return <div className="grid gap-4"><SectionIntro icon={Sparkles} title="模型能力" description="先继承通用能力预设，再针对具体 Provider / 模型覆盖实际能力。" badge="默认值 + 覆盖" />
    <Card><CardContent className="flex flex-wrap items-center gap-3 p-4"><div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="搜索 Provider 或模型" value={query} /></div><Badge variant="secondary">{rows.length} 个模型</Badge></CardContent></Card>
    <Card><CardContent className="overflow-x-auto p-0"><div className="min-w-[760px]"><div className="grid grid-cols-[minmax(220px,1fr)_repeat(7,72px)] border-b border-border bg-muted/30 px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><span>Provider / Model</span>{capabilityLabels.map((item) => <span className="text-center" key={item.key}>{item.short}</span>)}</div>{rows.length === 0 ? <EmptyState icon={Search} title="没有匹配模型" detail="调整搜索关键词后重试。" /> : rows.map(({ metadata, model, provider }) => <CapabilityRow key={`${provider.name}/${model}`} metadata={metadata} model={model} provider={provider.name} onChange={update} />)}</div></CardContent></Card>
  </div>;
}

function CapabilityRow({ metadata, model, provider, onChange }: { metadata?: ProviderModelMetadata; model: string; provider: string; onChange: (provider: string, model: string, key: keyof ProviderModelCapabilities, value: boolean) => void }) {
  const defaults = generalModelCapabilities(model);
  return <div className="grid grid-cols-[minmax(220px,1fr)_repeat(7,72px)] items-center border-b border-border/60 px-4 py-3 last:border-0"><div className="min-w-0"><div className="truncate text-[12px] font-medium">{model}</div><div className="truncate text-[10px] text-muted-foreground">{provider} · {metadata?.capabilities ? "存在 Provider 覆盖" : "继承通用预设"}</div></div>{capabilityLabels.map(({ key }) => { const overridden = metadata?.capabilities?.[key] !== undefined; return <div className="relative flex justify-center" key={key} title={overridden ? "Provider 覆盖" : "通用默认值"}><CapabilityToggle checked={Boolean(metadata?.capabilities?.[key] ?? defaults[key])} onCheckedChange={(checked) => onChange(provider, model, key, checked)} />{overridden ? <span className="absolute -right-1 top-0 h-1.5 w-1.5 rounded-full bg-primary" /> : null}</div>; })}</div>;
}

function CapabilityToggle({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return <Switch aria-label="切换模型能力" checked={checked} onCheckedChange={onCheckedChange} className="scale-[0.65]" />;
}

function ExportPanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  async function exportConfig() {
    if (!window.ccr?.exportData) return;
    setBusy(true); setError(""); setResult("");
    try { const response = await window.ccr.exportData(); if (!response.canceled) setResult(response.file || "已生成配置文件"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "导出失败。"); }
    finally { setBusy(false); }
  }
  return <div className="grid gap-4"><SectionIntro icon={Download} title="配置迁移" description="把 CCR 的 Provider、模型、顺序列表、Skills、MCP 和客户端配置带到另一台设备。" badge="Portable export v2" />
    <Card><CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center"><div className="flex gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileJson className="h-5 w-5" /></div><div><div className="text-[14px] font-semibold">导出完整 CCR 配置</div><div className="mt-1 text-[12px] leading-5 text-muted-foreground">历史记录、请求日志、用量统计和运行时数据库不会进入导出文件。API Key 会随完整配置导出，请妥善保管。</div></div></div><Button disabled={busy} onClick={() => void exportConfig()}>{busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}一键导出</Button></CardContent></Card>
    {result ? <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[12px] text-emerald-800"><Check className="mt-0.5 h-4 w-4 shrink-0" /><span className="break-all">导出完成：{result}</span></div> : null}
    {error ? <InlineError>{error}</InlineError> : null}
    <div className="grid gap-3 sm:grid-cols-2"><ExportScope title="会导出" items={["Provider 与 API Key", "模型能力与顺序列表", "客户端 Profile", "Skills 与 MCP"]} /><ExportScope title="不会导出" items={["统一历史记录", "请求日志与用量", "设备运行状态", "SQLite 运行时文件"]} muted /></div>
  </div>;
}

function ExportScope({ title, items, muted = false }: { title: string; items: string[]; muted?: boolean }) { return <Card><CardHeader><CardTitle className="flex items-center gap-2">{muted ? <X className="h-4 w-4 text-muted-foreground" /> : <Check className="h-4 w-4 text-emerald-600" />}{title}</CardTitle></CardHeader><CardContent className="grid gap-2 p-4">{items.map((item) => <div className="flex items-center gap-2 text-[12px] text-muted-foreground" key={item}><span className={cn("h-1.5 w-1.5 rounded-full", muted ? "bg-muted-foreground/40" : "bg-emerald-500")} />{item}</div>)}</CardContent></Card>; }

function SectionIntro({ icon: Icon, title, description, badge }: { icon: typeof History; title: string; description: string; badge: string }) { return <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div><div><h2 className="text-[20px] font-semibold tracking-[-0.025em]">{title}</h2><p className="mt-1 max-w-2xl text-[12px] leading-5 text-muted-foreground">{description}</p></div></div><Badge variant="outline">{badge}</Badge></div>; }
function MetricCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: "success" }) { return <Card><CardContent className="p-4"><div className="text-[11px] font-medium text-muted-foreground">{label}</div><div className={cn("mt-2 text-[22px] font-semibold tracking-[-0.04em]", tone === "success" && "text-emerald-600")}>{value}</div><div className="mt-1 text-[11px] text-muted-foreground">{detail}</div></CardContent></Card>; }
function EmptyState({ icon: Icon, title, detail }: { icon: typeof History; title: string; detail: string }) { return <div className="grid place-items-center px-6 py-16 text-center"><Icon className="h-7 w-7 text-muted-foreground/50" /><div className="mt-3 text-[13px] font-medium">{title}</div><div className="mt-1 text-[11px] text-muted-foreground">{detail}</div></div>; }
function InlineError({ children }: { children: string }) { return <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-[12px] text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{children}</div>; }
function formatMessageContent(content: unknown): string { if (typeof content === "string") return content; try { return JSON.stringify(content, null, 2); } catch { return String(content); } }

import { useMemo, useState } from "react";
import { Check, Copy, Globe2, Plug, Plus, Search, Terminal, Trash2, Wrench, X } from "lucide-react";
import type { AppConfig, CcrSkillConfig, GatewayMcpServerConfig } from "@ccr/core/contracts/app";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type IntegrationTab = "skills" | "mcp";

type SkillDraft = { content: string; description: string; name: string };
type McpDraft = { command: string; name: string; transport: "stdio" | "sse" | "streamable-http"; url: string };

const emptySkill: SkillDraft = { content: "", description: "", name: "" };
const emptyMcp: McpDraft = { command: "", name: "", transport: "streamable-http", url: "" };

export function IntegrationsView({ config, onChange }: { config: AppConfig; onChange: (integrations: AppConfig["integrations"]) => void }) {
  const [tab, setTab] = useState<IntegrationTab>("skills");
  const [query, setQuery] = useState("");
  const [skillDraft, setSkillDraft] = useState<SkillDraft | undefined>();
  const [mcpDraft, setMcpDraft] = useState<McpDraft | undefined>();
  const skills = useMemo(() => config.integrations.skills.filter((skill) => `${skill.name} ${skill.description ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())), [config.integrations.skills, query]);
  const mcpServers = useMemo(() => config.integrations.mcpServers.filter((server) => server.name.toLowerCase().includes(query.trim().toLowerCase())), [config.integrations.mcpServers, query]);

  function updateSkill(index: number, patch: Partial<CcrSkillConfig>) {
    onChange({ ...config.integrations, skills: config.integrations.skills.map((skill, itemIndex) => itemIndex === index ? { ...skill, ...patch } : skill) });
  }
  function removeSkill(index: number) {
    onChange({ ...config.integrations, skills: config.integrations.skills.filter((_, itemIndex) => itemIndex !== index) });
  }
  function duplicateSkill(skill: CcrSkillConfig) {
    onChange({ ...config.integrations, skills: [...config.integrations.skills, { ...skill, id: `${skill.id}-copy-${Date.now()}`, name: `${skill.name} copy` }] });
  }
  function saveSkill() {
    if (!skillDraft?.name.trim() || !skillDraft.content.trim()) return;
    const id = slugify(skillDraft.name);
    onChange({ ...config.integrations, skills: [...config.integrations.skills, { ...skillDraft, enabled: true, id }] });
    setSkillDraft(undefined);
  }
  function removeMcp(index: number) {
    onChange({ ...config.integrations, mcpServers: config.integrations.mcpServers.filter((_, itemIndex) => itemIndex !== index) });
  }
  function toggleMcp(index: number, enabled: boolean) {
    const servers = config.integrations.mcpServers.map((server, itemIndex) => itemIndex === index ? { ...server, enabled } : server);
    onChange({ ...config.integrations, mcpServers: servers });
  }
  function saveMcp() {
    if (!mcpDraft?.name.trim()) return;
    const common = { name: mcpDraft.name.trim(), protocolVersion: "2024-11-05", requestTimeoutMs: 30000, startupTimeoutMs: 600000 };
    const server: GatewayMcpServerConfig = mcpDraft.transport === "stdio"
      ? { ...common, args: [], command: mcpDraft.command.trim(), env: {}, stdioMessageMode: "content-length", transport: "stdio" }
      : { ...common, headers: {}, transport: mcpDraft.transport, url: mcpDraft.url.trim() };
    onChange({ ...config.integrations, mcpServers: [...config.integrations.mcpServers, server] });
    setMcpDraft(undefined);
  }

  return <div className="grid gap-4">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary"><Wrench className="h-3.5 w-3.5" /> Shared capabilities</div><h2 className="mt-2 text-[20px] font-semibold tracking-[-0.025em]">Skills 与 MCP</h2><p className="mt-1 text-[12px] text-muted-foreground">一处维护，供 Codex、DeepSeek Harness 以及其他客户端复用。</p></div><Button onClick={() => tab === "skills" ? setSkillDraft(emptySkill) : setMcpDraft(emptyMcp)}><Plus className="h-4 w-4" />新增{tab === "skills" ? " Skill" : " MCP"}</Button></div>
    <Card><CardContent className="flex flex-wrap items-center gap-3 p-3"><div className="flex rounded-lg bg-muted/70 p-1"><button className={cn("rounded-md px-3 py-1.5 text-[12px] font-medium", tab === "skills" && "bg-background text-foreground shadow-sm")} onClick={() => setTab("skills")} type="button"><Wrench className="mr-1.5 inline h-3.5 w-3.5" />Skills <span className="ml-1 text-muted-foreground">{config.integrations.skills.length}</span></button><button className={cn("rounded-md px-3 py-1.5 text-[12px] font-medium", tab === "mcp" && "bg-background text-foreground shadow-sm")} onClick={() => setTab("mcp")} type="button"><Plug className="mr-1.5 inline h-3.5 w-3.5" />MCP <span className="ml-1 text-muted-foreground">{config.integrations.mcpServers.length}</span></button></div><div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" onChange={(event) => setQuery(event.target.value)} placeholder={`搜索${tab === "skills" ? " Skill" : " MCP server"}`} value={query} /></div></CardContent></Card>
    {tab === "skills" ? <div className="grid gap-3">{skills.length === 0 ? <EmptyIntegration title="还没有 Skill" detail="用小而明确的指令片段，为不同客户端建立可复用能力。" icon={Wrench} /> : skills.map((skill) => { const index = config.integrations.skills.indexOf(skill); return <Card key={skill.id}><CardContent className="flex flex-wrap items-start gap-3 p-4"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Wrench className="h-4 w-4" /></div><div className="min-w-[220px] flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-[13px] font-semibold">{skill.name}</span><Badge variant={skill.enabled ? "success" : "outline"}>{skill.enabled ? "已启用" : "已停用"}</Badge></div><div className="mt-1 text-[11px] text-muted-foreground">{skill.description || "未填写描述"} · {skill.id}</div><details className="mt-3"><summary className="cursor-pointer text-[11px] text-primary">查看指令内容</summary><pre className="mt-2 max-h-36 overflow-auto rounded-lg bg-muted/50 p-3 text-[11px] leading-5 text-muted-foreground">{skill.content}</pre></details></div><div className="flex items-center gap-1"><Switch aria-label={`启用 ${skill.name}`} checked={skill.enabled} onCheckedChange={(enabled) => updateSkill(index, { enabled })} className="scale-[0.68]" /><Button aria-label="复制 Skill" onClick={() => duplicateSkill(skill)} size="iconSm" title="复制" variant="ghost"><Copy className="h-3.5 w-3.5" /></Button><Button aria-label="删除 Skill" onClick={() => removeSkill(index)} size="iconSm" title="删除" variant="ghost"><Trash2 className="h-3.5 w-3.5" /></Button></div></CardContent></Card>; })}</div> : <div className="grid gap-3">{mcpServers.length === 0 ? <EmptyIntegration title="还没有 MCP Server" detail="连接外部工具、数据源和本地进程，供多个客户端共享。" icon={Plug} /> : mcpServers.map((server) => { const index = config.integrations.mcpServers.indexOf(server); const active = server.enabled !== false; return <Card key={`${server.name}-${index}`}><CardContent className="flex flex-wrap items-center gap-3 p-4"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600">{server.transport === "stdio" ? <Terminal className="h-4 w-4" /> : <Globe2 className="h-4 w-4" />}</div><div className="min-w-[220px] flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-[13px] font-semibold">{server.name}</span><Badge variant="outline">{server.transport}</Badge><Badge variant={active ? "success" : "outline"}>{active ? "在线配置" : "已停用"}</Badge></div><div className="mt-1 truncate text-[11px] text-muted-foreground">{server.transport === "stdio" ? server.command : server.url}</div></div><div className="flex items-center gap-1"><Switch aria-label={`启用 ${server.name}`} checked={active} onCheckedChange={(enabled) => toggleMcp(index, enabled)} className="scale-[0.68]" /><Button aria-label="删除 MCP" onClick={() => removeMcp(index)} size="iconSm" title="删除" variant="ghost"><Trash2 className="h-3.5 w-3.5" /></Button></div></CardContent></Card>; })}</div>}
    {skillDraft ? <SkillEditor draft={skillDraft} onCancel={() => setSkillDraft(undefined)} onChange={setSkillDraft} onSave={saveSkill} /> : null}
    {mcpDraft ? <McpEditor draft={mcpDraft} onCancel={() => setMcpDraft(undefined)} onChange={setMcpDraft} onSave={saveMcp} /> : null}
  </div>;
}

function SkillEditor({ draft, onChange, onCancel, onSave }: { draft: SkillDraft; onChange: (draft: SkillDraft) => void; onCancel: () => void; onSave: () => void }) { return <Card className="border-primary/30"><CardHeader><CardTitle className="flex items-center justify-between">新增 Skill <Button aria-label="关闭" onClick={onCancel} size="iconSm" variant="ghost"><X className="h-4 w-4" /></Button></CardTitle></CardHeader><CardContent className="grid gap-3 p-4 sm:grid-cols-2"><Input onChange={(event) => onChange({ ...draft, name: event.target.value })} placeholder="Skill 名称" value={draft.name} /><Input onChange={(event) => onChange({ ...draft, description: event.target.value })} placeholder="一句话描述" value={draft.description} /><Textarea className="min-h-32 sm:col-span-2" onChange={(event) => onChange({ ...draft, content: event.target.value })} placeholder="输入可复用的指令内容..." value={draft.content} /><div className="flex justify-end gap-2 sm:col-span-2"><Button onClick={onCancel} variant="ghost">取消</Button><Button disabled={!draft.name.trim() || !draft.content.trim()} onClick={onSave}><Check className="h-4 w-4" />保存 Skill</Button></div></CardContent></Card>; }
function McpEditor({ draft, onChange, onCancel, onSave }: { draft: McpDraft; onChange: (draft: McpDraft) => void; onCancel: () => void; onSave: () => void }) { return <Card className="border-primary/30"><CardHeader><CardTitle className="flex items-center justify-between">新增 MCP Server <Button aria-label="关闭" onClick={onCancel} size="iconSm" variant="ghost"><X className="h-4 w-4" /></Button></CardTitle></CardHeader><CardContent className="grid gap-3 p-4 sm:grid-cols-2"><Input onChange={(event) => onChange({ ...draft, name: event.target.value })} placeholder="Server 名称" value={draft.name} /><label className="flex items-center gap-2 rounded-md border border-input px-3 text-[12px]">传输方式<select className="ml-auto bg-transparent py-2 text-[12px] outline-none" onChange={(event) => onChange({ ...draft, transport: event.target.value as McpDraft["transport"] })} value={draft.transport}><option value="streamable-http">Streamable HTTP</option><option value="sse">SSE</option><option value="stdio">stdio</option></select></label>{draft.transport === "stdio" ? <Input className="sm:col-span-2" onChange={(event) => onChange({ ...draft, command: event.target.value })} placeholder="启动命令，例如 npx -y @modelcontextprotocol/server-filesystem" value={draft.command} /> : <Input className="sm:col-span-2" onChange={(event) => onChange({ ...draft, url: event.target.value })} placeholder="https://example.com/mcp" value={draft.url} />}<div className="flex justify-end gap-2 sm:col-span-2"><Button onClick={onCancel} variant="ghost">取消</Button><Button disabled={!draft.name.trim() || (draft.transport === "stdio" ? !draft.command.trim() : !draft.url.trim())} onClick={onSave}><Check className="h-4 w-4" />保存 MCP</Button></div></CardContent></Card>; }
function EmptyIntegration({ icon: Icon, title, detail }: { icon: typeof Wrench; title: string; detail: string }) { return <Card><CardContent className="grid place-items-center px-6 py-16 text-center"><Icon className="h-8 w-8 text-muted-foreground/45" /><div className="mt-3 text-[13px] font-medium">{title}</div><div className="mt-1 max-w-sm text-[11px] leading-5 text-muted-foreground">{detail}</div></CardContent></Card>; }
function slugify(value: string): string { return value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "") || `skill-${Date.now()}`; }

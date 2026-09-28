import { useMemo, useState } from "react";
import type { AppConfig, CcrSkillConfig, GatewayMcpServerConfig } from "@ccr/core/contracts/app";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export function IntegrationsView({ config, onChange }: {
  config: AppConfig;
  onChange: (integrations: AppConfig["integrations"]) => void;
}) {
  const [skillsText, setSkillsText] = useState(() => JSON.stringify(config.integrations.skills, null, 2));
  const [mcpText, setMcpText] = useState(() => JSON.stringify(config.integrations.mcpServers, null, 2));
  const [error, setError] = useState("");

  const skillCount = useMemo(() => config.integrations.skills.filter((skill) => skill.enabled).length, [config.integrations.skills]);
  const mcpCount = config.integrations.mcpServers.length;

  function save() {
    try {
      const skills = JSON.parse(skillsText) as CcrSkillConfig[];
      const mcpServers = JSON.parse(mcpText) as GatewayMcpServerConfig[];
      if (!Array.isArray(skills) || !Array.isArray(mcpServers)) throw new Error("Skills 和 MCP 必须是数组。");
      if (skills.some((skill) => !skill?.id || !skill?.name || typeof skill.content !== "string")) {
        throw new Error("每个 skill 必须包含 id、name 和 content。");
      }
      setError("");
      onChange({ mcpServers, skills });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "配置 JSON 无效。");
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-[1100px] gap-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[20px] font-semibold tracking-[-0.02em]">Skills 与 MCP</div>
          <div className="mt-1 text-[13px] text-muted-foreground">集中维护供 Codex、DeepSeek Harness 及其他客户端使用的能力。</div>
        </div>
        <Button onClick={save}>保存集中配置</Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Skills <span className="font-normal text-muted-foreground">({skillCount} 已启用)</span></CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-[12px] text-muted-foreground">每项使用 id、name、content、enabled，可通过 metadata/source 记录来源。</p>
            <Textarea className="min-h-[420px] font-mono text-[12px]" onChange={(event) => setSkillsText(event.target.value)} value={skillsText} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>MCP Servers <span className="font-normal text-muted-foreground">({mcpCount})</span></CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-[12px] text-muted-foreground">支持 stdio、SSE 和 streamable HTTP；敏感值只应在本机安全保存。</p>
            <Textarea className="min-h-[420px] font-mono text-[12px]" onChange={(event) => setMcpText(event.target.value)} value={mcpText} />
          </CardContent>
        </Card>
      </div>
      {error ? <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{error}</div> : null}
    </div>
  );
}

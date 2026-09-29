import { useEffect, useMemo, useState } from "react";
import { Copy, GripVertical, Layers3, Plus, Route, Trash2 } from "lucide-react";
import type { AppConfig, GatewayProviderConfig, ProviderModelPoolEntry } from "@ccr/core/contracts/app";
import { Button, Card, CardContent, useAppText, cn } from "../shared/index";
import { createRouteModelOptions, providerDisplayIcon } from "../shared/providers";
import { normalizeRouterOrderLists } from "../shared/routing";

const GLOBAL_CLIENT = "global";
const OTHER_CLIENT = "non-standard";
const PROVIDER_DRAG_TYPE = "application/x-ccr-provider";
const ENTRY_DRAG_TYPE = "application/x-ccr-order-entry";

type ClientTab = { id: string; label: string };
type ModelOption = { label: string; value: string };

export function OrderListView({ config, onChange }: { config: AppConfig; onChange: (config: AppConfig) => void }) {
  const t = useAppText();
  const tabs = useMemo<ClientTab[]>(() => [
    { id: GLOBAL_CLIENT, label: t("Global") },
    ...config.profile.profiles.filter((profile) => profile.enabled).map((profile) => ({ id: profile.id, label: profile.name })),
    { id: OTHER_CLIENT, label: t("Other clients") }
  ], [config.profile.profiles, t]);
  const [activeClient, setActiveClient] = useState(GLOBAL_CLIENT);
  const [providerDragOver, setProviderDragOver] = useState(false);
  const selectedClient = tabs.some((tab) => tab.id === activeClient) ? activeClient : GLOBAL_CLIENT;
  const selectedLabel = tabs.find((tab) => tab.id === selectedClient)?.label ?? t("Global");
  const entries = config.Router.orderLists[selectedClient] ?? [];
  const modelOptions = createRouteModelOptions(config.Providers);

  function updateEntries(nextEntries: ProviderModelPoolEntry[]) {
    const orderLists = normalizeRouterOrderLists({ ...config.Router.orderLists, [selectedClient]: nextEntries });
    onChange({ ...config, Router: { ...config.Router, orderLists } });
  }

  function addProvider(provider: GatewayProviderConfig) {
    const model = provider.models[0];
    if (!model) return;
    updateEntries([...entries, {
      id: `${selectedClient}-${provider.id ?? provider.name}-${Date.now()}`,
      model,
      provider: provider.name
    }]);
  }

  function dropProvider(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setProviderDragOver(false);
    const providerName = event.dataTransfer.getData(PROVIDER_DRAG_TYPE);
    const provider = config.Providers.find((item) => item.name === providerName);
    if (provider) addProvider(provider);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <section className="rounded-2xl border border-border bg-card px-5 py-4 shadow-[inset_0_1px_0_var(--card-inset-highlight)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Route className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-[20px] font-semibold tracking-[-0.025em]">{t("Provider fallback order")}</h1>
              <p className="mt-1 text-[12px] leading-5 text-muted-foreground">{t("Drag Providers from the pool into an independent priority layer, then choose the model used by that layer.")}</p>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/35 px-3 py-2 text-right">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{t("Active client")}</div>
            <div className="mt-0.5 text-[12px] font-semibold">{selectedLabel}</div>
          </div>
        </div>
        <div className="mt-4 flex w-full gap-1 overflow-x-auto rounded-xl border border-border bg-muted/25 p-1">
          {tabs.map((tab) => (
            <button
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                selectedClient === tab.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
              )}
              key={tab.id}
              onClick={() => setActiveClient(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(250px,0.72fr)_minmax(430px,1.28fr)]">
        <Card className="flex min-h-[280px] min-w-0 flex-col overflow-hidden rounded-2xl">
          <div className="border-b border-border px-4 py-4">
            <div className="flex items-center gap-2 text-[15px] font-semibold"><Layers3 className="h-4 w-4 text-primary" />{t("All Providers")}</div>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{t("Drag or click to add a Provider to the execution order.")}</p>
          </div>
          <CardContent className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
            {config.Providers.length === 0 ? (
              <EmptyState>{t("No Providers configured")}</EmptyState>
            ) : config.Providers.map((provider, index) => (
              <ProviderPoolItem
                key={provider.id ?? `${provider.name}-${index}`}
                onAdd={() => addProvider(provider)}
                provider={provider}
              />
            ))}
          </CardContent>
        </Card>

        <Card
          className={cn("flex min-h-[360px] min-w-0 flex-col overflow-hidden rounded-2xl transition-colors", providerDragOver && "border-primary/70 bg-primary/[0.025]")}
          onDragEnter={(event) => {
            if (event.dataTransfer.types.includes(PROVIDER_DRAG_TYPE)) setProviderDragOver(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setProviderDragOver(false);
          }}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes(PROVIDER_DRAG_TYPE)) event.preventDefault();
          }}
          onDrop={dropProvider}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-4">
            <div>
              <div className="text-[15px] font-semibold">{t("Execution priority")}</div>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{t("Runs from P1 to Pn and returns to P1 after the last layer fails.")}</p>
            </div>
            <div className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">{entries.length} {t(entries.length === 1 ? "layer" : "layers")}</div>
          </div>
          <CardContent className="min-h-0 flex-1 space-y-2.5 overflow-auto p-3">
            {entries.length === 0 ? (
              <EmptyState>{t("Drag a Provider here to create P1")}</EmptyState>
            ) : entries.map((entry, index) => (
              <OrderEntry
                config={config}
                entries={entries}
                entry={entry}
                index={index}
                key={entry.id ?? `${selectedClient}-${index}`}
                modelOptions={modelOptions}
                onChange={updateEntries}
              />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProviderPoolItem({ onAdd, provider }: { onAdd: () => void; provider: GatewayProviderConfig }) {
  const t = useAppText();
  const disabled = provider.models.length === 0;
  return (
    <div
      className={cn("group flex min-w-0 items-center gap-2.5 rounded-xl border border-border bg-background/35 px-3 py-2.5 transition-colors", disabled ? "opacity-55" : "cursor-grab hover:border-primary/35 hover:bg-muted/40")}
      draggable={!disabled}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData(PROVIDER_DRAG_TYPE, provider.name);
      }}
    >
      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/70" />
      <ProviderIcon provider={provider} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">{provider.name}</div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">{provider.models.length} {t(provider.models.length === 1 ? "model" : "models")}</div>
      </div>
      <Button aria-label={`${t("Add")} ${provider.name}`} disabled={disabled} onClick={onAdd} size="iconSm" title={t("Add")} type="button" variant="ghost">
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

function OrderEntry({ config, entry, index, entries, modelOptions, onChange }: { config: AppConfig; entry: ProviderModelPoolEntry; index: number; entries: ProviderModelPoolEntry[]; modelOptions: ModelOption[]; onChange: (entries: ProviderModelPoolEntry[]) => void }) {
  const t = useAppText();
  const [dragging, setDragging] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const provider = config.Providers.find((item) => item.name === entry.provider);
  const currentValue = `${entry.provider}/${entry.model}`;
  const providerOptions = modelOptions.filter((option) => option.value.startsWith(`${entry.provider}/`));
  const options = providerOptions.some((option) => option.value === currentValue)
    ? providerOptions
    : [{ label: entry.model, value: currentValue }, ...providerOptions];

  function select(value: string) {
    const slash = value.indexOf("/");
    if (slash <= 0) return;
    onChange(entries.map((item, itemIndex) => itemIndex === index ? { ...item, provider: value.slice(0, slash), model: value.slice(slash + 1) } : item));
  }

  function duplicate() {
    onChange([...entries.slice(0, index + 1), { ...entry, id: `${entry.id ?? "entry"}-copy-${Date.now()}` }, ...entries.slice(index + 1)]);
  }

  function drop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    const sourceIndex = Number(event.dataTransfer.getData(ENTRY_DRAG_TYPE));
    if (!Number.isInteger(sourceIndex) || sourceIndex === index) return;
    const next = [...entries];
    const [item] = next.splice(sourceIndex, 1);
    next.splice(index, 0, item);
    onChange(next);
  }

  return (
    <div
      className={cn("flex min-w-0 items-center gap-3 rounded-xl border border-border bg-background/40 px-3 py-3 transition-all", dragging && "opacity-40", dragOver && "border-primary/70 bg-primary/[0.04]")}
      draggable
      onDragEnd={() => setDragging(false)}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(ENTRY_DRAG_TYPE)) {
          event.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(ENTRY_DRAG_TYPE, String(index));
        setDragging(true);
      }}
      onDrop={drop}
    >
      <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/75" />
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-[14px] font-semibold text-primary">P{index + 1}</div>
      {provider ? <ProviderIcon provider={provider} /> : <ProviderInitial name={entry.provider} />}
      <div className="min-w-0 flex-[0.85] truncate text-[14px] font-semibold" title={entry.provider}>{entry.provider}</div>
      <select
        aria-label={`${entry.provider} ${t("Call model")}`}
        className="theme-aware-select h-10 min-w-0 flex-[1.1] rounded-xl border border-input bg-background px-3 text-[12px] text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
        onChange={(event) => select(event.target.value)}
        value={currentValue}
      >
        {options.map((option) => <option className="theme-aware-select-option" key={`${option.value}-${option.label}`} value={option.value}>{modelLabel(option, entry.provider)}</option>)}
      </select>
      <div className="flex shrink-0 items-center gap-1">
        <Button aria-label={t("Duplicate")} onClick={duplicate} size="iconSm" title={t("Duplicate")} type="button" variant="ghost"><Copy className="h-4 w-4" /></Button>
        <Button aria-label={t("Remove")} onClick={() => onChange(entries.filter((_, itemIndex) => itemIndex !== index))} size="iconSm" title={t("Remove")} type="button" variant="ghost"><Trash2 className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function ProviderIcon({ provider }: { provider: GatewayProviderConfig }) {
  const [failed, setFailed] = useState(false);
  const icon = providerDisplayIcon(provider);
  useEffect(() => setFailed(false), [icon]);
  if (!icon || failed) return <ProviderInitial name={provider.name} />;
  return <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background"><img alt="" className="h-full w-full object-cover" draggable={false} onError={() => setFailed(true)} src={icon} /></span>;
}

function ProviderInitial({ name }: { name: string }) {
  return <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary text-[11px] font-bold text-primary-foreground">{name.trim().slice(0, 1).toUpperCase() || "P"}</span>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-36 place-items-center rounded-xl border border-dashed border-border bg-muted/10 px-5 text-center text-[12px] text-muted-foreground">{children}</div>;
}

function modelLabel(option: ModelOption, provider: string): string {
  const prefix = `${provider}/`;
  if (option.value.startsWith(prefix)) return option.value.slice(prefix.length);
  return option.label;
}

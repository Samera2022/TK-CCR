import { useMemo, useState } from "react";
import { Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import type { AppConfig, ProviderModelPoolEntry } from "@ccr/core/contracts/app";
import { Button, Card, CardContent, CardHeader, Field, Input, useAppText, cn } from "../shared/index";
import { createRouteModelOptions } from "../shared/providers";
import { normalizeRouterOrderLists } from "../shared/routing";

const GLOBAL_CLIENT = "global";
const OTHER_CLIENT = "non-standard";

type ClientTab = { id: string; label: string };

export function OrderListView({ config, onChange }: { config: AppConfig; onChange: (config: AppConfig) => void }) {
  const t = useAppText();
  const tabs = useMemo<ClientTab[]>(() => [
    { id: GLOBAL_CLIENT, label: t("Global") },
    ...config.profile.profiles.filter((profile) => profile.enabled).map((profile) => ({ id: profile.id, label: profile.name })),
    { id: OTHER_CLIENT, label: t("Other clients") }
  ], [config.profile.profiles, t]);
  const [activeClient, setActiveClient] = useState(GLOBAL_CLIENT);
  const selectedClient = tabs.some((tab) => tab.id === activeClient) ? activeClient : GLOBAL_CLIENT;
  const entries = config.Router.orderLists[selectedClient] ?? [];
  const modelOptions = createRouteModelOptions(config.Providers);

  function updateEntries(nextEntries: ProviderModelPoolEntry[]) {
    const orderLists = normalizeRouterOrderLists({ ...config.Router.orderLists, [selectedClient]: nextEntries });
    onChange({ ...config, Router: { ...config.Router, orderLists } });
  }

  function addEntry() {
    const first = modelOptions[0];
    if (!first) return;
    const slash = first.value.indexOf("/");
    updateEntries([...entries, { id: `${selectedClient}-${Date.now()}`, provider: first.value.slice(0, slash), model: first.value.slice(slash + 1) }]);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div>
        <div className="text-[20px] font-semibold tracking-tight">{t("Order List")}</div>
        <div className="mt-1 text-[12px] text-muted-foreground">{t("Choose a client and arrange its Provider/model fallback chain.")}</div>
      </div>
      <div className="min-h-0 flex-1">
        <div className="flex w-full gap-1 overflow-x-auto rounded-lg border border-border bg-muted/30 p-1">
          {tabs.map((tab) => <button className={cn("shrink-0 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors", selectedClient === tab.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")} key={tab.id} onClick={() => setActiveClient(tab.id)} type="button">{tab.label}</button>)}
        </div>
        <Card className="mt-3 flex min-h-0 flex-1 flex-col">
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold">{tabs.find((tab) => tab.id === selectedClient)?.label}</div>
              <div className="text-[11px] text-muted-foreground">{entries.length} {t(entries.length === 1 ? "entry" : "entries")}</div>
            </div>
            <Button onClick={addEntry} disabled={modelOptions.length === 0} type="button"><Plus className="h-4 w-4" />{t("Add")}</Button>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-auto space-y-2">
            {entries.length === 0 ? <div className="rounded-md border border-dashed border-border px-4 py-10 text-center text-[12px] text-muted-foreground">{t("No order entries configured")}</div> : entries.map((entry, index) => (
              <OrderEntry key={entry.id ?? `${selectedClient}-${index}`} entry={entry} index={index} entries={entries} modelOptions={modelOptions} onChange={(next) => updateEntries(next)} />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function OrderEntry({ entry, index, entries, modelOptions, onChange }: { entry: ProviderModelPoolEntry; index: number; entries: ProviderModelPoolEntry[]; modelOptions: Array<{ label: string; value: string }>; onChange: (entries: ProviderModelPoolEntry[]) => void }) {
  const t = useAppText();
  const [query, setQuery] = useState(`${entry.provider}/${entry.model}`);
  const [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState(false);
  const currentValue = `${entry.provider}/${entry.model}`;
  const filtered = modelOptions.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()) || option.value.toLowerCase().includes(query.trim().toLowerCase()));
  const exact = modelOptions.some((option) => option.value === query.trim());
  const options = query.trim() && !exact ? [{ label: `${t("Custom model")}: ${query.trim()}`, value: query.trim() }, ...filtered] : filtered;

  function replace(patch: Partial<ProviderModelPoolEntry>) {
    onChange(entries.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }
  function select(value: string) {
    const slash = value.indexOf("/");
    replace(slash > 0 ? { provider: value.slice(0, slash), model: value.slice(slash + 1) } : { provider: entry.provider, model: value });
    setQuery(value);
  }
  function duplicate() {
    onChange([...entries.slice(0, index + 1), { ...entry, id: `${entry.id ?? "entry"}-copy-${Date.now()}` }, ...entries.slice(index + 1)]);
  }
  function remove() { onChange(entries.filter((_, itemIndex) => itemIndex !== index)); }
  function move(direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= entries.length) return;
    const next = [...entries];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    onChange(next);
  }
  function drop(sourceIndex: number, targetIndex: number) {
    if (sourceIndex === targetIndex) {
      setDragging(false);
      return;
    }
    const next = [...entries];
    const [item] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, item);
    onChange(next);
    setDragging(false);
  }

  return <div draggable onDragStart={(event) => { event.dataTransfer.setData("text/plain", String(index)); setDragging(true); }} onDragEnd={() => setDragging(false)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(Number(event.dataTransfer.getData("text/plain")), index)} className={cn("rounded-lg border border-border bg-card p-3 transition-opacity", dragging && "opacity-40")}>
    <div className="flex items-start gap-2">
      <GripVertical className="mt-2 h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <Field label={t("Call model")}>
          <div className="relative">
            <Input aria-autocomplete="list" aria-expanded={open} role="combobox" value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); select(event.target.value); setOpen(true); }} />
            {open ? <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-48 overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg" role="listbox">
              {options.length > 0 ? options.map((option) => <button className="block w-full truncate rounded px-2 py-1.5 text-left text-[11px] hover:bg-muted" key={`${option.value}-${option.label}`} onMouseDown={(event) => event.preventDefault()} onClick={() => { select(option.value); setOpen(false); }} role="option" type="button">{option.label}</button>) : <div className="px-2 py-1.5 text-[11px] text-muted-foreground">{t("No matching models")}</div>}
            </div> : null}
          </div>
        </Field>
        <div className="mt-1 text-[10px] text-muted-foreground">{currentValue}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button aria-label={t("Move up")} disabled={index === 0} onClick={() => move(-1)} size="iconSm" title={t("Move up")} type="button" variant="ghost">↑</Button>
        <Button aria-label={t("Move down")} disabled={index === entries.length - 1} onClick={() => move(1)} size="iconSm" title={t("Move down")} type="button" variant="ghost">↓</Button>
        <Button aria-label={t("Duplicate")} onClick={duplicate} size="iconSm" title={t("Duplicate")} type="button" variant="ghost"><Copy className="h-3.5 w-3.5" /></Button>
        <Button aria-label={t("Remove")} onClick={remove} size="iconSm" title={t("Remove")} type="button" variant="ghost"><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  </div>;
}

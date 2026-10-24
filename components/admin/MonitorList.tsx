"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ChevronDown, Pause, Play, RefreshCw, Search, Trash2, X } from "lucide-react";
import { ListGroupRow, SortHeader, treeCell, treeContinuation } from "@/components/admin/ListGroupRow";
import { ListPager } from "@/components/admin/ListPager";
import { ListViewsBar, type ViewTab } from "@/components/admin/ListViewsBar";
import { MonitorExpandedPanel } from "@/components/admin/MonitorExpandedPanel";
import type { MonitorDetails } from "@/components/admin/MonitorDetailsDialog";
import type { MonitorCheck } from "@/components/admin/MonitorHistoryDrawer";
import type { MonitorFormValues } from "@/components/admin/MonitorForm";
import { useListKeys } from "@/components/admin/use-list-keys";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CopyPhrase } from "@/components/ui/copy-phrase";
import { Dialog, DialogActions, DialogSurface, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { flattenEntries, loadViews, pageEntries, rollupTicks, saveViews, type ListGroup, type SavedView } from "@/lib/list-views";
import { monitorTypeLabel } from "@/lib/monitor-kinds";
import { BULK_MONITOR_LIMIT, bulkMonitorDeletePhrase, matchesBulkMonitorDeletePhrase, monitorCountLabel, type BulkMonitorIntent } from "@/lib/monitor-bulk";
import { cn } from "@/lib/utils";

type Action = (formData: FormData) => Promise<void>;
type MonitorState = "up" | "down" | "pending" | "paused";
type GroupBy = "group" | "status" | "none";

export type MonitorListItem = {
  /** Safe for every viewer. */
  values: Pick<MonitorFormValues, "id" | "name" | "type" | "target" | "port" | "tags" | "groupName">;
  enabled: boolean;
  state: MonitorState;
  componentName: string | null;
  lastError: string | null;
  lastCheckedAt: string | null;
  lastLatencyMs: number | null;
  /** Newest first, at most UPTIME_TICKS. */
  checks: MonitorCheck[];
  /** Public status page this monitor reports to. */
  pageHref: string;
  /** Visibility controls for this monitor's response-time chart, independent of checks. */
  metric?: { visible: boolean; toggle: Action };
  /** Read-only settings for the details dialog; holds no secrets. */
  details: MonitorDetails;
  actions: { run: Action; toggle: Action; remove: Action };
};

const UPTIME_TICKS = 30;
const SLOW_MS = 2000;
const STATE_LABEL: Record<MonitorState, { label: string; tone: "ok" | "danger" | "neutral" | "warn" }> = {
  up: { label: "Up", tone: "ok" },
  down: { label: "Down", tone: "danger" },
  pending: { label: "Pending", tone: "warn" },
  paused: { label: "Paused", tone: "neutral" },
};
const STATE_ORDER: Record<MonitorState, number> = { down: 0, pending: 1, up: 2, paused: 3 };
const STATES = ["down", "pending", "up", "paused"] as const;

/** Built-in views. Saved views start from one of these and add search, tags, grouping and sort. */
const BUILT_IN: { id: string; label: string; match: (m: MonitorListItem) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "attention", label: "Needs attention", match: (m) => m.state === "down" || m.state === "pending" },
  { id: "slow", label: `Slow (over ${SLOW_MS / 1000} s)`, match: (m) => (m.lastLatencyMs ?? 0) > SLOW_MS },
  { id: "flaky", label: "Flaky", match: (m) => m.enabled && m.checks.filter((check) => !check.ok).length >= 2 },
  { id: "paused", label: "Paused", match: (m) => m.state === "paused" },
];
const baseMatch = (id: string) => (BUILT_IN.find((view) => view.id === id) ?? BUILT_IN[0]).match;

const SORTS = {
  attention: { label: "Sort: Needs attention first", compare: (a: MonitorListItem, b: MonitorListItem) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.values.name.localeCompare(b.values.name) },
  name: { label: "Sort: Name", compare: (a: MonitorListItem, b: MonitorListItem) => a.values.name.localeCompare(b.values.name) },
  slowest: { label: "Sort: Slowest first", compare: (a: MonitorListItem, b: MonitorListItem) => (b.lastLatencyMs ?? -1) - (a.lastLatencyMs ?? -1) || a.values.name.localeCompare(b.values.name) },
  uptime: { label: "Sort: Lowest uptime", compare: (a: MonitorListItem, b: MonitorListItem) => uptime(a) - uptime(b) || a.values.name.localeCompare(b.values.name) },
  checked: { label: "Sort: Last checked", compare: (a: MonitorListItem, b: MonitorListItem) => (Date.parse(b.lastCheckedAt ?? "") || 0) - (Date.parse(a.lastCheckedAt ?? "") || 0) },
} as const;
type SortKey = keyof typeof SORTS;
const isSortKey = (value: string): value is SortKey => value in SORTS;
const isGroupBy = (value: string): value is GroupBy => value === "group" || value === "status" || value === "none";

/** Share of recent checks that passed; monitors with no checks sort last. */
function uptime(m: MonitorListItem) {
  return m.checks.length ? m.checks.filter((check) => check.ok).length / m.checks.length : 2;
}

const matchesControls = (m: MonitorListItem, needle: string, tags: string[]) =>
  (!tags.length || m.values.tags.some((tag) => tags.includes(tag))) &&
  (!needle || [m.values.name, m.values.target, m.values.groupName ?? "", ...m.values.tags].some((text) => text.toLowerCase().includes(needle)));

function relativeTime(iso: string | null, now: number) {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

/** Last checks as thin bars, oldest left; empty slots pad to a fixed width so rows align. */
function UptimeTicks({ checks, now }: { checks: MonitorCheck[]; now: number }) {
  const ordered = checks.slice(0, UPTIME_TICKS).reverse();
  const up = ordered.filter((check) => check.ok).length;
  return (
    <div className="flex h-6 items-stretch gap-[2px]" role="img" aria-label={ordered.length ? `${up} of ${ordered.length} recent checks up` : "No checks yet"}>
      {Array.from({ length: UPTIME_TICKS - ordered.length }, (_, index) => (
        <span key={`empty-${index}`} aria-hidden className="w-1 rounded-[1px] bg-sunken" />
      ))}
      {ordered.map((check) => (
        <Tooltip key={check.id} content={{ children: `${relativeTime(check.checkedAt, now)} · ${check.error ?? (check.statusCode ? `HTTP ${check.statusCode}` : "OK")}${check.latencyMs === null ? "" : ` · ${check.latencyMs} ms`}` }}>
          <span aria-hidden className={cn("block w-1 rounded-[1px]", check.ok ? "bg-ok" : "bg-danger")} />
        </Tooltip>
      ))}
    </div>
  );
}

/** Roll-up of a group's recent checks: failing at a position if any monitor failed there. */
function GroupStrip({ items }: { items: MonitorListItem[] }) {
  const ticks = rollupTicks(items.map((item) => item.checks.slice(0, UPTIME_TICKS).map((check) => check.ok)), UPTIME_TICKS);
  return (
    <div className="flex h-2.5 items-stretch gap-[2px]" role="img" aria-label={`Combined recent checks for ${items.length} monitors`}>
      {ticks.map((tick, index) => <span key={index} aria-hidden className={cn("block w-1 rounded-[1px]", tick === "ok" ? "bg-ok" : tick === "fail" ? "bg-danger" : "bg-line")} />)}
    </div>
  );
}

const average = (values: number[]) => (values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null);

/** One table row; clicking it (or the chevron) opens the summary panel in a row underneath. */
function MonitorRowView({ monitor, canManage, now, selected, focused, expanded, indented, last, showGroup, onToggleSelect, onToggleExpand, onFocus }: {
  monitor: MonitorListItem; canManage: boolean; now: number; selected: boolean; focused: boolean; expanded: boolean; /** Under a group row, so it hangs off the tree line. */ indented: boolean; /** Last child on screen, so the tree line ends here. */ last: boolean; showGroup: boolean;
  onToggleSelect: () => void; onToggleExpand: () => void; onFocus: () => void;
}) {
  const { values: m } = monitor;
  const state = STATE_LABEL[monitor.state];
  return (
    <>
      <tr data-row-id={m.id} onClick={() => { onFocus(); onToggleExpand(); }} className={cn("cursor-pointer border-b border-line transition-colors hover:bg-sunken/40", selected && "bg-primary-soft/40")}>
        <td className={cn("w-10 py-2.5 pl-4 pr-0", focused && "shadow-[inset_3px_0_0_var(--color-primary)]")}>
          {canManage && <Checkbox checked={selected} onClick={(event) => event.stopPropagation()} onChange={onToggleSelect} aria-label={`Select ${m.name}`} />}
        </td>
        <td className={cn("w-full max-w-0 py-2.5 pr-3", indented ? treeCell(last) : "pl-3")}>
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 break-words font-semibold text-ink sm:truncate">{m.name}</span>
            {/* Wrapped because Badge sets its own display, which beats a responsive hidden on the badge itself. */}
            {showGroup && m.groupName && <span className="hidden lg:inline-flex"><Badge className="border-line bg-sunken text-ink-soft">{m.groupName}</Badge></span>}
            {m.tags.slice(0, 2).map((tag) => <span key={tag} className="hidden xl:inline-flex"><Badge>{tag}</Badge></span>)}
          </div>
          {/* Below sm the Status and Latency columns are hidden so the name keeps its width; they show here instead. */}
          <div className="mt-1 flex items-center gap-2 sm:hidden">
            <StatusBadge tone={state.tone} live={monitor.state === "up"}>{state.label}</StatusBadge>
            <span className="text-xs font-medium tabular-nums text-ink">{monitor.lastLatencyMs === null ? "—" : `${monitor.lastLatencyMs} ms`}</span>
          </div>
          <p className="mt-0.5 truncate font-mono text-xs text-ink-dim" title={m.target}>
            {m.type === "HEARTBEAT" ? "Inbound heartbeat" : `${m.target}${m.port ? `:${m.port}` : ""}`}
            {monitor.componentName && <span className="font-sans"> · {monitor.componentName}</span>}
          </p>
          {monitor.lastError && !expanded && (
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-danger-fg" title={monitor.lastError}>
              <AlertTriangle aria-hidden size={12} className="shrink-0" />
              <span className="truncate">{monitor.lastError}</span>
            </p>
          )}
        </td>
        <td className="hidden px-3 py-2.5 sm:table-cell"><StatusBadge tone={state.tone} live={monitor.state === "up"}>{state.label}</StatusBadge></td>
        <td className="hidden px-3 py-2.5 lg:table-cell"><Badge className="border-line bg-sunken text-ink-soft">{monitorTypeLabel(m.type)}</Badge></td>
        <td className="hidden px-3 py-2.5 md:table-cell"><UptimeTicks checks={monitor.checks} now={now} /></td>
        <td className="hidden whitespace-nowrap px-3 py-2.5 text-right text-xs font-medium tabular-nums text-ink sm:table-cell">{monitor.lastLatencyMs === null ? "—" : `${monitor.lastLatencyMs} ms`}</td>
        <td className="hidden px-3 py-2.5 text-right text-xs tabular-nums text-ink-dim sm:table-cell">{relativeTime(monitor.lastCheckedAt, now)}</td>
        <td className="w-10 py-2.5 pr-3">
          <Button type="button" variant="ghost" size="icon" data-button-guard="off" className="size-8" aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "Show"} details of ${m.name}`} onClick={(event) => { event.stopPropagation(); onFocus(); onToggleExpand(); }}>
            <ChevronDown aria-hidden size={16} className={cn("text-primary transition-transform", expanded && "rotate-180")} />
          </Button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-line">
          <td className="p-0" />
          <td colSpan={7} className={cn("p-0", indented && treeContinuation(last))}>
            <MonitorExpandedPanel monitor={monitor} canManage={canManage} indented={indented} />
          </td>
        </tr>
      )}
    </>
  );
}

const BULK_COPY: Record<BulkMonitorIntent, { title: (count: number) => string; body: string; confirm: string; destructive: boolean; eligible: (item: MonitorListItem) => boolean; skipped: string }> = {
  run: { title: (n) => `Check ${monitorCountLabel(n)} now?`, body: "Queues an immediate check for each running monitor, on top of its normal schedule.", confirm: "Check now", destructive: false, eligible: (item) => item.enabled, skipped: "paused, so they are skipped" },
  pause: { title: (n) => `Pause ${monitorCountLabel(n)}?`, body: "Checks stop and their components are no longer updated until you resume them. Check history is kept.", confirm: "Pause", destructive: false, eligible: (item) => item.enabled, skipped: "already paused, so they are skipped" },
  resume: { title: (n) => `Resume ${monitorCountLabel(n)}?`, body: "Each monitor is checked again right away and then on its normal schedule.", confirm: "Resume", destructive: false, eligible: (item) => !item.enabled, skipped: "already running, so they are skipped" },
  delete: { title: (n) => `Delete ${monitorCountLabel(n)} permanently?`, body: "Deletes each monitor with its check history. Components stay, but stop being updated by these monitors. This cannot be undone.", confirm: "Delete permanently", destructive: true, eligible: () => true, skipped: "" },
};

/** Warning dialog for a bulk action: what will happen, to which monitors, and for delete a typed confirmation. */
function BulkConfirmDialog({ intent, chosen, action, onClose, onDone }: { intent: BulkMonitorIntent; chosen: MonitorListItem[]; action: (formData: FormData) => Promise<string>; onClose: () => void; onDone: () => void }) {
  const [confirmation, setConfirmation] = useState("");
  const copy = BULK_COPY[intent];
  const skipped = chosen.filter((item) => !copy.eligible(item)).length;
  const typed = intent !== "delete" || matchesBulkMonitorDeletePhrase(confirmation, chosen.length);
  return createPortal(
    <Dialog open onOpenChange={onClose}>
      <DialogSurface>
        <DialogTitle>{copy.title(chosen.length)}</DialogTitle>
        <PlatformActionForm action={action} successMessage="Done" onSuccess={onDone} className="mt-3 space-y-4">
          <input type="hidden" name="intent" value={intent} />
          {chosen.map((item) => <input key={item.values.id} type="hidden" name="monitorId" value={item.values.id} />)}
          <p className="text-sm leading-6 text-ink-soft">{copy.body}</p>
          {skipped > 0 && <p className="text-sm leading-6 text-warn-fg">{monitorCountLabel(skipped)} {skipped === 1 ? "is" : "are"} {copy.skipped}.</p>}
          <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-sm text-ink">{chosen.map((item) => <li key={item.values.id}>{item.values.name}</li>)}</ul>
          {intent === "delete" && (
            <label className="block space-y-1.5 text-sm text-ink-soft">
              <span>Type <CopyPhrase text={bulkMonitorDeletePhrase(chosen.length)} /> to confirm</span>
              <Input name="confirmation" autoComplete="off" required autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
            </label>
          )}
          <DialogActions>
            <Button type="button" variant="secondary" data-button-guard="off" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant={copy.destructive ? "destructive" : "default"} disabled={!typed}>{copy.confirm}</Button>
          </DialogActions>
        </PlatformActionForm>
      </DialogSurface>
    </Dialog>,
    document.body,
  );
}

/** Monitor inbox: saved-view tabs, search, group-by and sort, rows that expand in place, bulk actions and paging. */
export function MonitorList({ monitors, canManage, now, bulkAction, viewsKey }: { monitors: MonitorListItem[]; canManage: boolean; now: number; /** bulkMonitorAction bound to the page on the server; a bound server action cannot be created in the client. */ bulkAction: (formData: FormData) => Promise<string>; /** Identifies this list's saved views in localStorage, e.g. the page id. */ viewsKey: string }) {
  const storageKey = `signalhub:views:monitors:${viewsKey}`;
  const [query, setQuery] = useState("");
  const [base, setBase] = useState("all");
  const [activeTab, setActiveTab] = useState("all");
  const [tags, setTags] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>("group");
  const [sort, setSort] = useState<SortKey>("attention");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<BulkMonitorIntent | null>(null);
  const [saved, setSaved] = useState<SavedView[]>([]);
  // localStorage does not exist on the server; read it after hydration so markup matches.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSaved(loadViews(storageKey)); }, [storageKey]);

  const needle = query.trim().toLowerCase();
  const allTags = useMemo(() => [...new Set(monitors.flatMap((m) => m.values.tags))].sort(), [monitors]);
  const tabs: ViewTab[] = useMemo(() => [
    ...BUILT_IN.map((view) => ({ id: view.id, label: view.label, count: monitors.filter(view.match).length, saved: false })),
    ...saved.map((view) => ({ id: view.id, label: view.name, count: monitors.filter((m) => baseMatch(view.base)(m) && matchesControls(m, view.query.trim().toLowerCase(), view.tags)).length, saved: true })),
  ], [monitors, saved]);

  const visible = useMemo(
    () => monitors.filter((m) => baseMatch(base)(m) && matchesControls(m, needle, tags)).sort(SORTS[sort].compare),
    [monitors, base, needle, tags, sort],
  );
  const filtered = needle !== "" || base !== "all" || tags.length > 0;
  const grouped = groupBy !== "none";
  // Groups start collapsed, except while filtering so matches are never hidden; `toggled` holds the ones flipped from that default.
  const defaultOpen = filtered;
  const openKey = (key: string) => `${groupBy}:${defaultOpen ? "o" : "c"}:${key}`;
  const isOpen = (key: string) => defaultOpen !== toggled.has(openKey(key));


  const groups = useMemo<ListGroup<MonitorListItem>[]>(() => {
    if (groupBy === "none") return [{ key: "all", name: "All monitors", items: visible }];
    if (groupBy === "status") return STATES.flatMap((state) => { const items = visible.filter((m) => m.state === state); return items.length ? [{ key: state, name: STATE_LABEL[state].label, items }] : []; });
    const byGroup = new Map<string, MonitorListItem[]>();
    for (const m of visible) byGroup.set(m.values.groupName ?? "", [...(byGroup.get(m.values.groupName ?? "") ?? []), m]);
    const downIn = (items: MonitorListItem[]) => items.filter((m) => m.state === "down").length;
    return [...byGroup.entries()]
      .sort(([a, ai], [b, bi]) => (a === "" ? 1 : b === "" ? -1 : (sort === "attention" ? downIn(bi) - downIn(ai) : 0) || a.localeCompare(b)))
      .map(([name, items]) => ({ key: `g:${name}`, name: name || "Ungrouped", items }));
  }, [visible, groupBy, sort]);

  const openKeys = new Set(groups.filter((group) => isOpen(group.key)).map((group) => group.key));
  const entries = flattenEntries(groups, openKeys, grouped);
  const paged = pageEntries(entries, groups, page, size, grouped);
  const rowIds = paged.entries.flatMap((entry) => (entry.kind === "row" ? [entry.item.values.id] : []));

  // Only monitors that are listed right now can be acted on: what is selected is what the person sees.
  const chosen = visible.filter((item) => selected.has(item.values.id));
  const allSelected = visible.length > 0 && chosen.length === visible.length;
  const overLimit = chosen.length > BULK_MONITOR_LIMIT;
  const clear = useCallback(() => { setSelected(new Set()); setConfirming(null); }, []);
  const flip = (set: Set<string>, id: string) => { const next = new Set(set); if (!next.delete(id)) next.add(id); return next; };
  const toggleSelect = (id: string) => setSelected((current) => flip(current, id));
  const setMany = (items: MonitorListItem[], on: boolean) => setSelected((current) => {
    const next = new Set(current);
    for (const item of items) { if (on) next.add(item.values.id); else next.delete(item.values.id); }
    return next;
  });
  const toggleExpand = (id: string) => setExpanded((current) => flip(current, id));

  useListKeys({ ids: rowIds, focusId, expanded, setFocusId, onToggleSelect: (id) => { if (canManage) toggleSelect(id); }, onToggleExpand: toggleExpand, onCollapseAll: () => setExpanded(new Set()) });

  const chip = (active: boolean) => cn(
    "inline-flex h-8 items-center gap-1.5 rounded-chip border px-3 text-xs font-medium transition-colors",
    active ? "border-primary bg-primary-soft text-primary-ink" : "border-line bg-surface text-ink-soft hover:bg-sunken",
  );
  const selectView = (id: string) => {
    const view = saved.find((candidate) => candidate.id === id);
    if (view) {
      setBase(BUILT_IN.some((b) => b.id === view.base) ? view.base : "all");
      setQuery(view.query);
      setTags(view.tags);
      setGroupBy(isGroupBy(view.groupBy) ? view.groupBy : "group");
      setSort(isSortKey(view.sort) ? view.sort : "attention");
    } else setBase(id);
    setActiveTab(id);
    setPage(1);
  };
  const saveCurrent = (name: string) => {
    const view: SavedView = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, base, query, tags, groupBy, sort };
    const next = [...saved, view];
    setSaved(next);
    saveViews(storageKey, next);
    setActiveTab(view.id);
  };
  const deleteView = (id: string) => {
    const next = saved.filter((view) => view.id !== id);
    setSaved(next);
    saveViews(storageKey, next);
    if (activeTab === id) setActiveTab(base);
  };
  const setSortKey = (key: SortKey) => { setSort(key); setPage(1); };
  const resetFilters = () => { setQuery(""); setBase("all"); setActiveTab("all"); setTags([]); setPage(1); };

  return (
    <section aria-label="Monitors" className="space-y-4">
      <ListViewsBar tabs={tabs} active={activeTab} savedCount={saved.length} onSelect={selectView} onSave={saveCurrent} onDelete={deleteView} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-72">
          <Search aria-hidden size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-primary" />
          <Input type="search" aria-label="Search monitors" placeholder="Search name, target or tag" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} className="pl-9" />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row lg:ml-auto">
          <div className="sm:w-52">
            <Select aria-label="Group monitors by" className="w-full" value={groupBy} onChange={(event) => { if (isGroupBy(event.target.value)) { setGroupBy(event.target.value); setPage(1); } }}>
              <option value="group">Group by: Group</option>
              <option value="status">Group by: Status</option>
              <option value="none">No grouping</option>
            </Select>
          </div>
          <div className="sm:w-60">
            <Select aria-label="Sort monitors" className="w-full" value={sort} onChange={(event) => { if (isSortKey(event.target.value)) { setSort(event.target.value); setPage(1); } }}>
              {(Object.keys(SORTS) as SortKey[]).map((key) => <option key={key} value={key}>{SORTS[key].label}</option>)}
            </Select>
          </div>
        </div>
      </div>
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by tag">
          <span className="text-xs text-ink-dim">Tags</span>
          {allTags.map((tag) => {
            const active = tags.includes(tag);
            return (
              <button key={tag} type="button" aria-pressed={active} onClick={() => { setTags(active ? tags.filter((t) => t !== tag) : [...tags, tag]); setPage(1); }} className={chip(active)}>
                {tag}
              </button>
            );
          })}
        </div>
      )}

      {canManage && visible.length > 0 && (
        <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-line bg-sunken/60 px-4 py-2">
          <label className="flex items-center gap-2 text-xs font-medium text-ink-soft">
            <Checkbox
              checked={allSelected}
              ref={(input) => { if (input) input.indeterminate = chosen.length > 0 && !allSelected; }}
              onChange={() => setMany(visible, !allSelected)}
              aria-label="Select all listed monitors"
            />
            {chosen.length ? `${chosen.length} selected` : `Select all ${visible.length}`}
          </label>
          {chosen.length > 0 && (
            <div className="ml-auto flex flex-wrap items-center gap-1">
              {overLimit && <span role="alert" className="mr-2 text-xs font-medium text-danger-fg">Select {BULK_MONITOR_LIMIT} monitors or fewer</span>}
              <Button type="button" size="sm" variant="ghost" data-button-guard="off" disabled={overLimit} onClick={() => setConfirming("run")} className="[&_svg]:!text-info-fg"><RefreshCw aria-hidden size={14} />Check now</Button>
              <Button type="button" size="sm" variant="ghost" data-button-guard="off" disabled={overLimit} onClick={() => setConfirming("pause")} className="[&_svg]:!text-warn-fg"><Pause aria-hidden size={14} />Pause</Button>
              <Button type="button" size="sm" variant="ghost" data-button-guard="off" disabled={overLimit} onClick={() => setConfirming("resume")} className="[&_svg]:!text-ok-fg"><Play aria-hidden size={14} />Resume</Button>
              <Button type="button" size="sm" variant="ghost" data-button-guard="off" disabled={overLimit} onClick={() => setConfirming("delete")} className="hover:bg-danger-bg [&_svg]:!text-danger-fg"><Trash2 aria-hidden size={14} />Delete</Button>
              <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="Clear selection" title="Clear selection" data-button-guard="off" onClick={clear}><X aria-hidden size={14} /></Button>
            </div>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-card border border-dashed border-line px-4 py-10 text-center text-sm text-ink-dim">
          No monitors match these filters.{" "}
          {filtered && <Button type="button" variant="link" onClick={resetFilters}>Clear filters</Button>}
        </div>
      ) : (
        <>
          <div className="overflow-clip rounded-card border border-line bg-surface shadow-card">
            {/* Keep the page as the scroll container so each monitor's actions can stick below the app header. */}
            <Table containerClassName="overflow-visible">
              <thead className="border-b border-line-strong bg-sunken/60">
                <tr>
                  <th scope="col" className="w-10"><span className="sr-only">Select</span></th>
                  <SortHeader label="Monitor" active={sort === "name"} onClick={() => setSortKey("name")} />
                  <SortHeader label="Status" active={sort === "attention"} onClick={() => setSortKey("attention")} className="hidden sm:table-cell" />
                  <SortHeader label="Type" active={false} onClick={() => setSortKey("name")} className="hidden lg:table-cell" />
                  <SortHeader label="Last 30 checks" active={sort === "uptime"} onClick={() => setSortKey("uptime")} className="hidden md:table-cell" />
                  <SortHeader label="Latency" align="right" active={sort === "slowest"} onClick={() => setSortKey("slowest")} className="hidden sm:table-cell" />
                  <SortHeader label="Last check" align="right" active={sort === "checked"} onClick={() => setSortKey("checked")} className="hidden sm:table-cell" />
                  <th scope="col" className="w-10"><span className="sr-only">Details</span></th>
                </tr>
              </thead>
              <tbody>
                {paged.entries.map((entry, index) => {
                  if (entry.kind === "group") {
                    const { group } = entry;
                    const picked = group.items.filter((item) => selected.has(item.values.id)).length;
                    const latency = average(group.items.flatMap((item) => (item.lastLatencyMs === null ? [] : [item.lastLatencyMs])));
                    const withChecks = group.items.filter((item) => item.checks.length > 0);
                    const groupUptime = withChecks.length ? Math.round((withChecks.reduce((sum, item) => sum + uptime(item), 0) / withChecks.length) * 1000) / 10 : null;
                    return (
                      <ListGroupRow
                        key={`${group.key}${entry.continued ? ":continued" : ""}`}
                        name={group.name}
                        open={isOpen(group.key)}
                        continued={entry.continued}
                        selectable={canManage}
                        picked={picked}
                        total={group.items.length}
                        selectLabel={`Select all monitors in ${group.name}`}
                        nameSpan={1}
                        meta={<>
                          <span>{monitorCountLabel(group.items.length)}</span>
                          {picked > 0 && <span className="font-semibold text-primary-ink">{picked} selected</span>}
                        </>}
                        onToggle={() => setToggled((current) => flip(current, openKey(group.key)))}
                        onSelect={(on) => setMany(group.items, on)}
                      >
                        {/* The Status column is hidden below sm, so the name cell spans only Monitor and this stands in for Status. */}
                        <td className="hidden sm:table-cell" />
                        <td className="hidden px-3 py-2 lg:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {STATES.map((state) => { const count = group.items.filter((item) => item.state === state).length; return count ? <StatusBadge key={state} tone={STATE_LABEL[state].tone} className="text-[0.6875rem]">{count} {STATE_LABEL[state].label.toLowerCase()}</StatusBadge> : null; })}
                          </div>
                        </td>
                        <td className="hidden px-3 py-2 md:table-cell"><GroupStrip items={group.items} /></td>
                        <td className="hidden whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums text-ink-soft sm:table-cell">{latency === null ? "—" : `${latency} ms`}</td>
                        <td className="hidden px-3 py-2 text-right text-xs tabular-nums text-ink-soft sm:table-cell">{groupUptime === null ? "—" : `${groupUptime}% up`}</td>
                        <td className="w-10" />
                      </ListGroupRow>
                    );
                  }
                  const monitor = entry.item;
                  const id = monitor.values.id;
                  const next = paged.entries[index + 1];
                  return (
                    <MonitorRowView
                      key={id}
                      monitor={monitor}
                      canManage={canManage}
                      now={now}
                      selected={selected.has(id)}
                      focused={focusId === id}
                      expanded={expanded.has(id)}
                      indented={grouped}
                      last={!next || next.kind === "group"}
                      showGroup={groupBy !== "group"}
                      onToggleSelect={() => toggleSelect(id)}
                      onToggleExpand={() => toggleExpand(id)}
                      onFocus={() => setFocusId(id)}
                    />
                  );
                })}
              </tbody>
            </Table>
          </div>
          <ListPager
            page={paged.page}
            pages={paged.pages}
            size={size}
            summary={`${monitorCountLabel(visible.length)}${grouped ? ` in ${groups.length} ${groups.length === 1 ? "group" : "groups"}` : ""}${paged.pages > 1 ? ` · page ${paged.page} of ${paged.pages}` : ""}`}
            onPage={setPage}
            onSize={(next) => { setSize(next); setPage(1); }}
          />
          <p className="hidden text-xs text-ink-dim sm:block">
            Keyboard: <kbd className="rounded-chip border border-line bg-sunken px-1.5 font-mono">j</kbd> <kbd className="rounded-chip border border-line bg-sunken px-1.5 font-mono">k</kbd> move, <kbd className="rounded-chip border border-line bg-sunken px-1.5 font-mono">x</kbd> select, <kbd className="rounded-chip border border-line bg-sunken px-1.5 font-mono">Enter</kbd> open, <kbd className="rounded-chip border border-line bg-sunken px-1.5 font-mono">Esc</kbd> close all.
          </p>
        </>
      )}

      {confirming && <BulkConfirmDialog intent={confirming} chosen={chosen} action={bulkAction} onClose={() => setConfirming(null)} onDone={clear} />}
    </section>
  );
}

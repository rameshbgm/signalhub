"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Eye, EyeOff, Search, Send, Trash2, X } from "lucide-react";
import { ListGroupRow, SortHeader, treeCell, treeContinuation } from "@/components/admin/ListGroupRow";
import { ListPager } from "@/components/admin/ListPager";
import { ListViewsBar, type ViewTab } from "@/components/admin/ListViewsBar";
import { useListKeys } from "@/components/admin/use-list-keys";
import { PageSubmitButton } from "@/components/admin/PageSubmitButton";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { ActionRow, InlineActionForm } from "@/components/InlineActionForm";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CopyPhrase } from "@/components/ui/copy-phrase";
import { Dialog, DialogActions, DialogSurface, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table } from "@/components/ui/table";
import { flattenEntries, loadViews, pageEntries, saveViews, type ListGroup, type SavedView } from "@/lib/list-views";
import { BULK_METRIC_LIMIT, bulkMetricDeletePhrase, matchesBulkMetricDeletePhrase, metricCountLabel, type BulkMetricIntent } from "@/lib/metric-bulk";
import { metricDecimals } from "@/lib/status";
import { cn } from "@/lib/utils";

type Action = (formData: FormData) => Promise<void>;
type GroupBy = "component" | "visibility" | "none";

export type MetricListItem = {
  id: string;
  name: string;
  description: string;
  decimals: number;
  visible: boolean;
  /** Latest value already formatted with its unit, or null before the first data point. */
  latest: string | null;
  lastPointAt: string | null;
  componentName: string | null;
  actions: { push: Action; precision: Action; toggle: Action; remove: Action };
};

/** Built-in views. Saved views start from one of these and add search, grouping and sort. */
const BUILT_IN: { id: string; label: string; match: (m: MetricListItem) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "visible", label: "Visible", match: (m) => m.visible },
  { id: "hidden", label: "Hidden", match: (m) => !m.visible },
  { id: "nodata", label: "No data yet", match: (m) => m.latest === null },
];
const baseMatch = (id: string) => (BUILT_IN.find((view) => view.id === id) ?? BUILT_IN[0]).match;

const SORTS = {
  name: { label: "Sort: Name", compare: (a: MetricListItem, b: MetricListItem) => a.name.localeCompare(b.name) },
  recent: { label: "Sort: Recently updated", compare: (a: MetricListItem, b: MetricListItem) => (Date.parse(b.lastPointAt ?? "") || 0) - (Date.parse(a.lastPointAt ?? "") || 0) || a.name.localeCompare(b.name) },
  hidden: { label: "Sort: Hidden first", compare: (a: MetricListItem, b: MetricListItem) => Number(a.visible) - Number(b.visible) || a.name.localeCompare(b.name) },
} as const;
type SortKey = keyof typeof SORTS;
const isSortKey = (value: string): value is SortKey => value in SORTS;
const isGroupBy = (value: string): value is GroupBy => value === "component" || value === "visibility" || value === "none";

const matchesQuery = (m: MetricListItem, needle: string) => !needle || m.name.toLowerCase().includes(needle) || m.description.toLowerCase().includes(needle);

function relativeTime(iso: string | null, now: number) {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

/** One table row; clicking it (or the chevron) opens the push and precision forms in a row underneath. */
function MetricRowView({ metric, canManage, now, selected, focused, expanded, indented, last, onToggleSelect, onToggleExpand, onFocus }: {
  metric: MetricListItem; canManage: boolean; now: number; selected: boolean; focused: boolean; expanded: boolean; /** Under a group row, so it hangs off the tree line. */ indented: boolean; /** Last child on screen, so the tree line ends here. */ last: boolean;
  onToggleSelect: () => void; onToggleExpand: () => void; onFocus: () => void;
}) {
  const decimals = metricDecimals(metric.decimals);
  return (
    <>
      <tr data-row-id={metric.id} onClick={() => { onFocus(); onToggleExpand(); }} className={cn("cursor-pointer border-b border-line transition-colors hover:bg-sunken/40", selected && "bg-primary-soft/40")}>
        <td className={cn("w-10 py-2.5 pl-4 pr-0", focused && "shadow-[inset_3px_0_0_var(--color-primary)]")}>
          {canManage && <Checkbox checked={selected} onClick={(event) => event.stopPropagation()} onChange={onToggleSelect} aria-label={`Select ${metric.name}`} />}
        </td>
        <td className={cn("w-full max-w-0 py-2.5 pr-3", indented ? treeCell(last) : "pl-3")}>
          <span className="block min-w-0 break-words font-semibold text-ink sm:truncate">{metric.name}</span>
          <p className="mt-0.5 truncate text-xs text-ink-dim" title={metric.description}>{metric.description || "No description"}</p>
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-right text-base font-bold tabular-nums tracking-tight text-ink">{metric.latest ?? "—"}</td>
        <td className="hidden px-3 py-2.5 sm:table-cell"><StatusBadge tone={metric.visible ? "ok" : "neutral"}>{metric.visible ? "Visible" : "Hidden"}</StatusBadge></td>
        <td className="hidden px-3 py-2.5 text-xs text-ink-soft lg:table-cell">{metric.componentName ?? "—"}</td>
        <td className="hidden px-3 py-2.5 text-right text-xs tabular-nums text-ink-dim sm:table-cell">{metric.lastPointAt ? relativeTime(metric.lastPointAt, now) : "no data"}</td>
        <td className="whitespace-nowrap py-2.5 pr-3" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-end gap-1.5">
            {canManage && (
              <PlatformActionForm action={metric.actions.toggle} successMessage={`${metric.name} ${metric.visible ? "hidden from" : "shown on"} the status page`} className="flex">
                <PageSubmitButton variant="secondary" size="sm" pendingLabel="Saving…" aria-label={`${metric.visible ? "Hide" : "Show"} ${metric.name} ${metric.visible ? "from" : "on"} the status page`} title={metric.visible ? "Hide from the status page. Monitoring and data collection continue." : "Show this metric on the status page."}>
                  {metric.visible ? <EyeOff aria-hidden size={14} /> : <Eye aria-hidden size={14} />}
                  <span className="sm:hidden">{metric.visible ? "Hide" : "Show"}</span>
                  <span className="hidden sm:inline">{metric.visible ? "Hide from page" : "Show on page"}</span>
                </PageSubmitButton>
              </PlatformActionForm>
            )}
            <Button type="button" variant="ghost" size="icon" data-button-guard="off" className="size-8" aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "Show"} details of ${metric.name}`} onClick={() => { onFocus(); onToggleExpand(); }}>
              <ChevronDown aria-hidden size={16} className={cn("text-primary transition-transform", expanded && "rotate-180")} />
            </Button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-line">
          <td className="p-0" />
          <td colSpan={6} className={cn("p-0", indented && treeContinuation(last))}>
<div className={cn("space-y-4 bg-sunken/30 py-4 pr-4 text-sm leading-6 text-ink-soft", indented ? "pl-4 sm:pl-11" : "pl-4 sm:pl-3")}>
          <div>
            <p className="text-xs text-ink-dim">Latest value</p>
            <p className="text-2xl font-bold tabular-nums tracking-tight text-ink">{metric.latest ?? "—"}</p>
            <p className="text-xs text-ink-dim">Updated {relativeTime(metric.lastPointAt, now)}{metric.componentName ? ` · ${metric.componentName}` : ""}</p>
          </div>

          {canManage && (
            <div className="grid gap-4 sm:grid-cols-2">
              <PlatformActionForm successMessage="Data point recorded" action={metric.actions.push} className="flex items-end gap-2">
                <Field label="Push data point" htmlFor={`metric-push-${metric.id}`} className="min-w-0 flex-1">
                  <Input id={`metric-push-${metric.id}`} aria-label={`Push data point for ${metric.name}`} name="value" type="number" step={10 ** -decimals} placeholder="Value" required />
                </Field>
                <Button type="submit" variant="secondary"><Send aria-hidden size={14} />Push</Button>
              </PlatformActionForm>
              <PlatformActionForm successMessage="Decimal places saved" action={metric.actions.precision} className="flex items-end gap-2">
                <Field label="Decimal places" htmlFor={`metric-decimals-${metric.id}`} className="min-w-0 flex-1">
                  <Input id={`metric-decimals-${metric.id}`} aria-label={`Decimal places for ${metric.name}`} name="decimals" type="number" min={0} max={10} step={1} defaultValue={decimals} required />
                </Field>
                <Button type="submit" variant="secondary">Save precision</Button>
              </PlatformActionForm>
            </div>
          )}

          {canManage && (
            <p className="text-xs leading-5 text-ink-dim">
              Or push programmatically:{" "}
              <code className="break-all rounded-chip bg-sunken px-1.5 py-0.5 font-mono text-ink-soft">POST /api/v1/manage/metrics/{metric.id}/points</code>
            </p>
          )}

          {canManage && (
            <ActionRow className="flex flex-wrap items-center gap-1.5 border-t border-line pt-3" messageClassName="justify-end">
              <InlineActionForm action={metric.actions.remove}>
                <PageSubmitButton variant="ghost" size="sm" pendingLabel="Deleting…" confirmMessage={`Delete ${metric.name} and all of its data points? This cannot be undone.`} className="hover:bg-danger-bg hover:text-danger-fg [&_svg]:!text-danger hover:[&_svg]:!text-danger-fg">
                  <Trash2 aria-hidden size={14} />
                  Delete
                  <span className="sr-only"> {metric.name}</span>
                </PageSubmitButton>
              </InlineActionForm>
            </ActionRow>
          )}
        </div>
          </td>
        </tr>
      )}
    </>
  );
}

const BULK_COPY: Record<BulkMetricIntent, { title: (count: number) => string; body: string; confirm: string; destructive: boolean; eligible: (item: MetricListItem) => boolean; skipped: string }> = {
  show: { title: (n) => `Show ${metricCountLabel(n)} on the status page?`, body: "Each metric becomes visible to everyone who can see the page.", confirm: "Show", destructive: false, eligible: (item) => !item.visible, skipped: "already visible, so they are skipped" },
  hide: { title: (n) => `Hide ${metricCountLabel(n)} from the status page?`, body: "Each metric disappears from the public page. Its data points are kept and you can show it again.", confirm: "Hide", destructive: false, eligible: (item) => item.visible, skipped: "already hidden, so they are skipped" },
  delete: { title: (n) => `Delete ${metricCountLabel(n)} permanently?`, body: "Deletes each metric with all of its data points. This cannot be undone.", confirm: "Delete permanently", destructive: true, eligible: () => true, skipped: "" },
};

/** Warning dialog for a bulk action: what will happen, to which metrics, and for delete a typed confirmation. */
function BulkConfirmDialog({ intent, chosen, action, onClose, onDone }: { intent: BulkMetricIntent; chosen: MetricListItem[]; action: (formData: FormData) => Promise<string>; onClose: () => void; onDone: () => void }) {
  const [confirmation, setConfirmation] = useState("");
  const copy = BULK_COPY[intent];
  const skipped = chosen.filter((item) => !copy.eligible(item)).length;
  const typed = intent !== "delete" || matchesBulkMetricDeletePhrase(confirmation, chosen.length);
  return createPortal(
    <Dialog open onOpenChange={onClose}>
      <DialogSurface>
        <DialogTitle>{copy.title(chosen.length)}</DialogTitle>
        <PlatformActionForm action={action} successMessage="Done" onSuccess={onDone} className="mt-3 space-y-4">
          <input type="hidden" name="intent" value={intent} />
          {chosen.map((item) => <input key={item.id} type="hidden" name="metricId" value={item.id} />)}
          <p className="text-sm leading-6 text-ink-soft">{copy.body}</p>
          {skipped > 0 && <p className="text-sm leading-6 text-warn-fg">{metricCountLabel(skipped)} {skipped === 1 ? "is" : "are"} {copy.skipped}.</p>}
          <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-sm text-ink">{chosen.map((item) => <li key={item.id}>{item.name}</li>)}</ul>
          {intent === "delete" && (
            <label className="block space-y-1.5 text-sm text-ink-soft">
              <span>Type <CopyPhrase text={bulkMetricDeletePhrase(chosen.length)} /> to confirm</span>
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

/** Metric inbox: saved-view tabs, search, group-by and sort, rows that expand in place, bulk actions and paging. */
export function MetricList({ metrics, canManage, now, bulkAction, viewsKey }: { metrics: MetricListItem[]; canManage: boolean; now: number; /** bulkMetricAction bound to the page on the server; a bound server action cannot be created in the client. */ bulkAction: (formData: FormData) => Promise<string>; /** Identifies this list's saved views in localStorage, e.g. the page id. */ viewsKey: string }) {
  const storageKey = `signalhub:views:metrics:${viewsKey}`;
  const [query, setQuery] = useState("");
  const [base, setBase] = useState("all");
  const [activeTab, setActiveTab] = useState("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("component");
  const [sort, setSort] = useState<SortKey>("name");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<BulkMetricIntent | null>(null);
  const [saved, setSaved] = useState<SavedView[]>([]);
  // localStorage does not exist on the server; read it after hydration so markup matches.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSaved(loadViews(storageKey)); }, [storageKey]);

  const needle = query.trim().toLowerCase();
  const tabs: ViewTab[] = useMemo(() => [
    ...BUILT_IN.map((view) => ({ id: view.id, label: view.label, count: metrics.filter(view.match).length, saved: false })),
    ...saved.map((view) => ({ id: view.id, label: view.name, count: metrics.filter((m) => baseMatch(view.base)(m) && matchesQuery(m, view.query.trim().toLowerCase())).length, saved: true })),
  ], [metrics, saved]);

  const visible = useMemo(
    () => metrics.filter((m) => baseMatch(base)(m) && matchesQuery(m, needle)).sort(SORTS[sort].compare),
    [metrics, base, needle, sort],
  );
  const filtered = needle !== "" || base !== "all";
  const grouped = groupBy !== "none";
  // Groups start collapsed, except while filtering so matches are never hidden; `toggled` holds the ones flipped from that default.
  const defaultOpen = filtered;
  const openKey = (key: string) => `${groupBy}:${defaultOpen ? "o" : "c"}:${key}`;
  const isOpen = (key: string) => defaultOpen !== toggled.has(openKey(key));

  const groups = useMemo<ListGroup<MetricListItem>[]>(() => {
    if (groupBy === "none") return [{ key: "all", name: "All metrics", items: visible }];
    if (groupBy === "visibility") {
      return [{ key: "visible", name: "Visible", items: visible.filter((m) => m.visible) }, { key: "hidden", name: "Hidden", items: visible.filter((m) => !m.visible) }].filter((group) => group.items.length > 0);
    }
    const byComponent = new Map<string, MetricListItem[]>();
    for (const m of visible) byComponent.set(m.componentName ?? "", [...(byComponent.get(m.componentName ?? "") ?? []), m]);
    return [...byComponent.entries()]
      .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)))
      .map(([name, items]) => ({ key: `c:${name}`, name: name || "No component", items }));
  }, [visible, groupBy]);

  const openKeys = new Set(groups.filter((group) => isOpen(group.key)).map((group) => group.key));
  const entries = flattenEntries(groups, openKeys, grouped);
  const paged = pageEntries(entries, groups, page, size, grouped);
  const rowIds = paged.entries.flatMap((entry) => (entry.kind === "row" ? [entry.item.id] : []));

  // Only metrics that are listed right now can be acted on: what is selected is what the person sees.
  const chosen = visible.filter((item) => selected.has(item.id));
  const allSelected = visible.length > 0 && chosen.length === visible.length;
  const overLimit = chosen.length > BULK_METRIC_LIMIT;
  const clear = useCallback(() => { setSelected(new Set()); setConfirming(null); }, []);
  const flip = (set: Set<string>, id: string) => { const next = new Set(set); if (!next.delete(id)) next.add(id); return next; };
  const toggleSelect = (id: string) => setSelected((current) => flip(current, id));
  const setMany = (items: MetricListItem[], on: boolean) => setSelected((current) => {
    const next = new Set(current);
    for (const item of items) { if (on) next.add(item.id); else next.delete(item.id); }
    return next;
  });
  const toggleExpand = (id: string) => setExpanded((current) => flip(current, id));

  useListKeys({ ids: rowIds, focusId, expanded, setFocusId, onToggleSelect: (id) => { if (canManage) toggleSelect(id); }, onToggleExpand: toggleExpand, onCollapseAll: () => setExpanded(new Set()) });

  const selectView = (id: string) => {
    const view = saved.find((candidate) => candidate.id === id);
    if (view) {
      setBase(BUILT_IN.some((b) => b.id === view.base) ? view.base : "all");
      setQuery(view.query);
      setGroupBy(isGroupBy(view.groupBy) ? view.groupBy : "component");
      setSort(isSortKey(view.sort) ? view.sort : "name");
    } else setBase(id);
    setActiveTab(id);
    setPage(1);
  };
  const saveCurrent = (name: string) => {
    const view: SavedView = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, base, query, tags: [], groupBy, sort };
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
  const resetFilters = () => { setQuery(""); setBase("all"); setActiveTab("all"); setPage(1); };

  return (
    <section aria-label="Metrics" className="space-y-4">
      <ListViewsBar tabs={tabs} active={activeTab} savedCount={saved.length} onSelect={selectView} onSave={saveCurrent} onDelete={deleteView} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-72">
          <Search aria-hidden size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-primary" />
          <Input type="search" aria-label="Search metrics" placeholder="Search name or description" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} className="pl-9" />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row lg:ml-auto">
          <div className="sm:w-56">
            <Select aria-label="Group metrics by" className="w-full" value={groupBy} onChange={(event) => { if (isGroupBy(event.target.value)) { setGroupBy(event.target.value); setPage(1); } }}>
              <option value="component">Group by: Component</option>
              <option value="visibility">Group by: Visibility</option>
              <option value="none">No grouping</option>
            </Select>
          </div>
          <div className="sm:w-60">
            <Select aria-label="Sort metrics" className="w-full" value={sort} onChange={(event) => { if (isSortKey(event.target.value)) { setSort(event.target.value); setPage(1); } }}>
              {(Object.keys(SORTS) as SortKey[]).map((key) => <option key={key} value={key}>{SORTS[key].label}</option>)}
            </Select>
          </div>
        </div>
      </div>

      {canManage && visible.length > 0 && (
        <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-line bg-sunken/60 px-4 py-2">
          <label className="flex items-center gap-2 text-xs font-medium text-ink-soft">
            <Checkbox
              checked={allSelected}
              ref={(input) => { if (input) input.indeterminate = chosen.length > 0 && !allSelected; }}
              onChange={() => setMany(visible, !allSelected)}
              aria-label="Select all listed metrics"
            />
            {chosen.length ? `${chosen.length} selected` : `Select all ${visible.length}`}
          </label>
          {chosen.length > 0 && (
            <div className="ml-auto flex flex-wrap items-center gap-1">
              {overLimit && <span role="alert" className="mr-2 text-xs font-medium text-danger-fg">Select {BULK_METRIC_LIMIT} metrics or fewer</span>}
              <Button type="button" size="sm" variant="ghost" data-button-guard="off" disabled={overLimit} onClick={() => setConfirming("show")} className="[&_svg]:!text-ok-fg"><Eye aria-hidden size={14} />Show</Button>
              <Button type="button" size="sm" variant="ghost" data-button-guard="off" disabled={overLimit} onClick={() => setConfirming("hide")} className="[&_svg]:!text-warn-fg"><EyeOff aria-hidden size={14} />Hide</Button>
              <Button type="button" size="sm" variant="ghost" data-button-guard="off" disabled={overLimit} onClick={() => setConfirming("delete")} className="hover:bg-danger-bg [&_svg]:!text-danger-fg"><Trash2 aria-hidden size={14} />Delete</Button>
              <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="Clear selection" title="Clear selection" data-button-guard="off" onClick={clear}><X aria-hidden size={14} /></Button>
            </div>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-card border border-dashed border-line px-4 py-10 text-center text-sm text-ink-dim">
          No metrics match these filters.{" "}
          {filtered && <Button type="button" variant="link" onClick={resetFilters}>Clear filters</Button>}
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <Table>
              <thead className="border-b border-line-strong bg-sunken/60">
                <tr>
                  <th scope="col" className="w-10"><span className="sr-only">Select</span></th>
                  <SortHeader label="Metric" active={sort === "name"} onClick={() => setSortKey("name")} />
                  <SortHeader label="Latest value" align="right" active={false} onClick={() => setSortKey("recent")} />
                  <SortHeader label="Visibility" active={sort === "hidden"} onClick={() => setSortKey("hidden")} className="hidden sm:table-cell" />
                  <SortHeader label="Component" active={false} onClick={() => setSortKey("name")} className="hidden lg:table-cell" />
                  <SortHeader label="Updated" align="right" active={sort === "recent"} onClick={() => setSortKey("recent")} className="hidden sm:table-cell" />
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {paged.entries.map((entry, index) => {
                  if (entry.kind === "group") {
                    const { group } = entry;
                    const hidden = group.items.filter((item) => !item.visible).length;
                    const picked = group.items.filter((item) => selected.has(item.id)).length;
                    const newest = Math.max(0, ...group.items.map((item) => Date.parse(item.lastPointAt ?? "") || 0));
                    return (
                      <ListGroupRow
                        key={`${group.key}${entry.continued ? ":continued" : ""}`}
                        name={group.name}
                        open={isOpen(group.key)}
                        continued={entry.continued}
                        selectable={canManage}
                        picked={picked}
                        total={group.items.length}
                        selectLabel={`Select all metrics in ${group.name}`}
                        meta={<>
                          <span>{metricCountLabel(group.items.length)}</span>
                          {picked > 0 && <span className="font-semibold text-primary-ink">{picked} selected</span>}
                        </>}
                        onToggle={() => setToggled((current) => flip(current, openKey(group.key)))}
                        onSelect={(on) => setMany(group.items, on)}
                      >
                        <td className="hidden px-3 py-2 sm:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {group.items.length - hidden > 0 && <StatusBadge tone="ok" className="text-[0.6875rem]">{group.items.length - hidden} visible</StatusBadge>}
                            {hidden > 0 && <StatusBadge tone="neutral" className="text-[0.6875rem]">{hidden} hidden</StatusBadge>}
                          </div>
                        </td>
                        <td className="hidden lg:table-cell" />
                        <td className="hidden px-3 py-2 text-right text-xs tabular-nums text-ink-soft sm:table-cell">{newest ? relativeTime(new Date(newest).toISOString(), now) : "no data"}</td>
                        <td className="w-10" />
                      </ListGroupRow>
                    );
                  }
                  const metric = entry.item;
                  const next = paged.entries[index + 1];
                  return (
                    <MetricRowView
                      key={metric.id}
                      metric={metric}
                      canManage={canManage}
                      now={now}
                      selected={selected.has(metric.id)}
                      focused={focusId === metric.id}
                      expanded={expanded.has(metric.id)}
                      indented={grouped}
                      last={!next || next.kind === "group"}
                      onToggleSelect={() => toggleSelect(metric.id)}
                      onToggleExpand={() => toggleExpand(metric.id)}
                      onFocus={() => setFocusId(metric.id)}
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
            summary={`${metricCountLabel(visible.length)}${grouped ? ` in ${groups.length} ${groups.length === 1 ? "group" : "groups"}` : ""}${paged.pages > 1 ? ` · page ${paged.page} of ${paged.pages}` : ""}`}
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

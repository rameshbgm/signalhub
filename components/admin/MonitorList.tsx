"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Pause, Play, RefreshCw, Search, Trash2 } from "lucide-react";
import { MonitorDrawer, type MonitorCheck } from "@/components/admin/MonitorDrawer";
import type { MonitorFormValues } from "@/components/admin/MonitorForm";
import { PageSubmitButton } from "@/components/admin/PageSubmitButton";
import { ActionRow, InlineActionForm } from "@/components/InlineActionForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Action = (formData: FormData) => Promise<void>;
type MonitorState = "up" | "down" | "pending" | "paused";

export type MonitorListItem = {
  values: MonitorFormValues;
  enabled: boolean;
  state: MonitorState;
  componentName: string | null;
  lastError: string | null;
  lastCheckedAt: string | null;
  lastLatencyMs: number | null;
  /** Newest first, at most UPTIME_TICKS. */
  checks: MonitorCheck[];
  actions: { run: Action; toggle: Action; remove: Action; update: Action };
};

const UPTIME_TICKS = 30;
const STATE_LABEL: Record<MonitorState, { label: string; tone: "ok" | "danger" | "neutral" | "warn" }> = {
  up: { label: "Up", tone: "ok" },
  down: { label: "Down", tone: "danger" },
  pending: { label: "Pending", tone: "warn" },
  paused: { label: "Paused", tone: "neutral" },
};
const FILTERS = ["all", "down", "up", "pending", "paused"] as const;

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

function MonitorRowView({ monitor, components, canManage, now }: { monitor: MonitorListItem; components: { id: string; name: string }[]; canManage: boolean; now: number }) {
  const { values: m, actions } = monitor;
  const state = STATE_LABEL[monitor.state];
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={state.tone} live={monitor.state === "up"}>{state.label}</StatusBadge>
          <span className="min-w-0 truncate font-semibold text-ink">{m.name}</span>
          <Badge className="border-line bg-sunken text-ink-soft">{m.type}</Badge>
          {m.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
        </div>
        <p className="mt-1 truncate font-mono text-xs text-ink-dim" title={m.target}>
          {m.type === "HEARTBEAT" ? "Inbound heartbeat" : `${m.target}${m.port ? `:${m.port}` : ""}`}
          {monitor.componentName && <span className="font-sans"> · {monitor.componentName}</span>}
        </p>
        {monitor.lastError && (
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-danger-fg" title={monitor.lastError}>
            <AlertTriangle aria-hidden size={12} className="shrink-0" />
            <span className="truncate">{monitor.lastError}</span>
          </p>
        )}
      </div>
      <div className="flex items-center gap-4">
        <UptimeTicks checks={monitor.checks} now={now} />
        <div className="w-20 text-right text-xs tabular-nums">
          <div className="font-medium text-ink">{monitor.lastLatencyMs === null ? "—" : `${monitor.lastLatencyMs} ms`}</div>
          <div className="text-ink-dim">{relativeTime(monitor.lastCheckedAt, now)}</div>
        </div>
      </div>
      <ActionRow className="flex items-center gap-0.5" messageClassName="max-w-56">
        {canManage && (
          <>
            <InlineActionForm action={actions.run}>
              <Button type="submit" variant="ghost" size="icon" className="size-8 [&_svg]:!text-info-fg" aria-label={`Check ${m.name} on next poll`} title="Check on next poll"><RefreshCw aria-hidden size={15} /></Button>
            </InlineActionForm>
            <InlineActionForm action={actions.toggle}>
              <Button type="submit" variant="ghost" size="icon" className={cn("size-8", monitor.enabled ? "[&_svg]:!text-warn-fg" : "[&_svg]:!text-ok-fg")} aria-label={`${monitor.enabled ? "Pause" : "Resume"} ${m.name}`} title={monitor.enabled ? "Pause" : "Resume"}>
                {monitor.enabled ? <Pause aria-hidden size={15} /> : <Play aria-hidden size={15} />}
              </Button>
            </InlineActionForm>
          </>
        )}
        {canManage ? (
          <MonitorDrawer action={actions.update} components={components} monitor={m} checks={monitor.checks} />
        ) : null}
        {canManage && (
          <InlineActionForm action={actions.remove}>
            <PageSubmitButton variant="ghost" size="icon" pendingLabel="…" title="Delete" className="size-8 hover:bg-danger-bg [&_svg]:!text-danger-fg" confirmMessage={`Delete the monitor ${m.name} and its check history? This cannot be undone.`}>
              <Trash2 aria-hidden size={15} />
              <span className="sr-only">Delete {m.name}</span>
            </PageSubmitButton>
          </InlineActionForm>
        )}
      </ActionRow>
    </li>
  );
}

/** Compact, filterable monitor list grouped by monitor group. */
export function MonitorList({ monitors, components, canManage, now }: { monitors: MonitorListItem[]; components: { id: string; name: string }[]; canManage: boolean; now: number }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [tags, setTags] = useState<string[]>([]);

  const allTags = useMemo(() => [...new Set(monitors.flatMap((m) => m.values.tags))].sort(), [monitors]);
  const counts = useMemo(() => {
    const result: Record<(typeof FILTERS)[number], number> = { all: monitors.length, down: 0, up: 0, pending: 0, paused: 0 };
    for (const m of monitors) result[m.state] += 1;
    return result;
  }, [monitors]);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const visible = monitors.filter((m) =>
      (filter === "all" || m.state === filter) &&
      (!tags.length || m.values.tags.some((tag) => tags.includes(tag))) &&
      (!needle || m.values.name.toLowerCase().includes(needle) || m.values.target.toLowerCase().includes(needle)));
    // Down first so problems are at the top of every group.
    visible.sort((a, b) => Number(b.state === "down") - Number(a.state === "down") || a.values.name.localeCompare(b.values.name));
    const byGroup = new Map<string, MonitorListItem[]>();
    for (const m of visible) {
      const key = m.values.groupName ?? "";
      byGroup.set(key, [...(byGroup.get(key) ?? []), m]);
    }
    return [...byGroup.entries()].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
  }, [monitors, query, filter, tags]);

  const filtered = query || filter !== "all" || tags.length > 0;
  const chip = (active: boolean) => cn(
    "inline-flex h-8 items-center gap-1.5 rounded-chip border px-3 text-xs font-medium transition-colors",
    active ? "border-primary bg-primary-soft text-primary-ink" : "border-line bg-surface text-ink-soft hover:bg-sunken",
  );

  return (
    <section aria-label="Monitors" className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-72">
          <Search aria-hidden size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim" />
          <Input type="search" aria-label="Search monitors" placeholder="Search name or target" value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
          {FILTERS.map((value) => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={chip(filter === value)}>
              {value === "all" ? "All" : STATE_LABEL[value].label}
              <span className="tabular-nums text-ink-dim">{counts[value]}</span>
            </button>
          ))}
        </div>
      </div>
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by tag">
          <span className="text-xs text-ink-dim">Tags</span>
          {allTags.map((tag) => {
            const active = tags.includes(tag);
            return (
              <button key={tag} type="button" aria-pressed={active} onClick={() => setTags(active ? tags.filter((t) => t !== tag) : [...tags, tag])} className={chip(active)}>
                {tag}
              </button>
            );
          })}
        </div>
      )}

      {groups.length === 0 ? (
        <div className="rounded-card border border-dashed border-line px-4 py-10 text-center text-sm text-ink-dim">
          No monitors match these filters.{" "}
          {filtered && <Button type="button" variant="link" onClick={() => { setQuery(""); setFilter("all"); setTags([]); }}>Clear filters</Button>}
        </div>
      ) : (
        groups.map(([group, items]) => (
          <div key={group || "ungrouped"} className="rounded-card border border-line bg-surface shadow-card">
            {(groups.length > 1 || group) && (
              <h2 className="rounded-t-card border-b border-line bg-sunken/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                {group || "Ungrouped"} <span className="font-normal text-ink-dim">· {items.length}</span>
              </h2>
            )}
            <ul className="divide-y divide-line">
              {items.map((monitor) => <MonitorRowView key={monitor.values.id} monitor={monitor} components={components} canManage={canManage} now={now} />)}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

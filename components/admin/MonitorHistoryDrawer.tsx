"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useToast } from "@/components/ui/toast";
import { createPortal } from "react-dom";
import { ArrowDownUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Filter, History, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions, DialogSurface, DialogTitle } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchWithTimeout } from "@/lib/client-fetch";
import type { MonitorCheckView } from "@/lib/monitor-checks";

export type MonitorCheck = MonitorCheckView;

/** Right-side panel shell for the check history. */
function Drawer({ title, subtitle, onClose, children }: { title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode }) {
  return createPortal(
    <Dialog open onOpenChange={(_event, data) => { if (!data.open) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="monitor-drawer-title" className="-m-4 flex h-dvh w-full max-w-xl animate-pop flex-col justify-self-end border-l border-line bg-surface text-ink shadow-float">
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <div id="monitor-drawer-title"><DialogTitle>{title}</DialogTitle></div>
            {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={onClose} className="-mr-2 -mt-1 shrink-0">
            <X aria-hidden size={16} />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">{children}</div>
      </div>
    </Dialog>,
    document.body,
  );
}

/** Matches MONITOR_CHECK_PAGE_SIZE in lib/monitor-checks (a server module). */
const PAGE_SIZE = 25;

/** Details of one check in a centered modal; rows with no value (no status code, no error) are left out. */
function CheckDetail({ name, check, onClose }: { name: string; check: MonitorCheck; onClose: () => void }) {
  const rows = ([
    ["Checked", new Date(check.checkedAt).toLocaleString(undefined, { dateStyle: "full", timeStyle: "medium" })],
    ["Latency", check.latencyMs === null ? null : `${check.latencyMs} ms`],
    ["HTTP status", check.statusCode],
    ["Error", check.error],
    ["Check ID", check.id],
  ] as [string, string | number | null][]).filter(([, value]) => value !== null && value !== "");
  return createPortal(
    <Dialog open onOpenChange={(_event, data) => { if (!data.open) onClose(); }}>
      <DialogSurface>
        <div className="flex items-center justify-between gap-3 pr-0">
          <DialogTitle>{name} check</DialogTitle>
          <StatusBadge tone={check.ok ? "ok" : "danger"}>{check.ok ? "Up" : "Down"}</StatusBadge>
        </div>
        <dl className="mt-4 space-y-3 text-sm">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-ink-dim">{label}</dt>
              <dd className="mt-0.5 break-words tabular-nums text-ink">{value}</dd>
            </div>
          ))}
          {check.response && (
            <div>
              <dt className="text-xs text-ink-dim">Saved response</dt>
              <dd><pre className="mt-0.5 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-control border border-line bg-sunken p-3 font-mono text-xs text-ink">{check.response}</pre></dd>
            </div>
          )}
        </dl>
        <DialogActions><Button type="button" variant="secondary" onClick={onClose}>Close</Button></DialogActions>
      </DialogSurface>
    </Dialog>,
    document.body,
  );
}

type HistoryPage = { checks: MonitorCheck[]; page: number; pageCount: number; total: number };
type HistoryFilter = { result: "all" | "up" | "down"; sort: "newest" | "oldest" | "slowest" | "fastest" };
const DEFAULT_FILTER: HistoryFilter = { result: "all", sort: "newest" };

/** Check history: numbered pages, filter and sort all run on the server. */
function CheckHistory({ monitorId, name, firstPage }: { monitorId: string; name: string; firstPage: HistoryPage }) {
  const [page, setPage] = useState<HistoryPage>(firstPage);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useToast("danger", error);
  // Keep the id, not the row: the first page renders from the list's response-less snapshot and is replaced once loaded.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = page.checks.find((check) => check.id === selectedId) ?? null;
  const [filter, setFilter] = useState<HistoryFilter>(DEFAULT_FILTER);

  const fetchPage = useCallback(async (target: number, active: HistoryFilter) => {
    const params = new URLSearchParams({ page: String(target), sort: active.sort });
    if (active.result !== "all") params.set("result", active.result);
    const response = await fetchWithTimeout(`/api/admin/monitors/${monitorId}/checks?${params}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message ?? "Could not load check history");
    return data as HistoryPage;
  }, [monitorId]);

  const load = async (target: number, active: HistoryFilter) => {
    setLoading(true);
    setError(null);
    try {
      setPage(await fetchPage(target, active));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load check history");
    } finally {
      setLoading(false);
    }
  };

  // The list's newest checks render instantly; this fills in the real page count.
  useEffect(() => {
    fetchPage(1, DEFAULT_FILTER).then(setPage, () => undefined);
  }, [fetchPage]);

  const apply = (change: Partial<HistoryFilter>) => {
    const active = { ...filter, ...change };
    setFilter(active);
    void load(1, active);
  };
  const go = (target: number) => void load(target, filter);
  const atStart = loading || page.page <= 1;
  const atEnd = loading || page.page >= page.pageCount;
  const iconClass = "text-primary-ink";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Filter aria-hidden size={14} className="text-info-fg" />
        <Select aria-label="Filter by result" value={filter.result} onChange={(event) => apply({ result: event.target.value as HistoryFilter["result"] })}>
          <option value="all">All results</option>
          <option value="up">Up only</option>
          <option value="down">Down only</option>
        </Select>
        <ArrowDownUp aria-hidden size={14} className="ml-1 text-warn-fg" />
        <Select aria-label="Sort order" value={filter.sort} onChange={(event) => apply({ sort: event.target.value as HistoryFilter["sort"] })}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="slowest">Slowest first</option>
          <option value="fastest">Fastest first</option>
        </Select>
        <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => apply(DEFAULT_FILTER)} disabled={loading}>
          <RefreshCw aria-hidden size={14} className={iconClass} />
          Latest
        </Button>
      </div>
      <p className="text-xs text-ink-dim" aria-live="polite">{loading ? "Loading…" : `${page.total} checks`}</p>
      <div>
        <Table aria-busy={loading}>
          <TableHeader>
            <TableRow><TableHead>Checked</TableHead><TableHead>Result</TableHead><TableHead>Latency</TableHead><TableHead>Response</TableHead></TableRow>
          </TableHeader>
          <TableBody className={loading ? "opacity-60" : undefined}>
            {page.checks.map((check) => (
              <TableRow key={check.id} tabIndex={0} className="cursor-pointer" onClick={() => setSelectedId(check.id)} onKeyDown={(event) => { if (event.key === "Enter") setSelectedId(check.id); }}>
                <TableCell className="whitespace-nowrap px-4 py-2.5 tabular-nums">{new Date(check.checkedAt).toLocaleString()}</TableCell>
                <TableCell className="px-4 py-2.5"><StatusBadge tone={check.ok ? "ok" : "danger"}>{check.ok ? "Up" : "Down"}</StatusBadge></TableCell>
                <TableCell className="whitespace-nowrap px-4 py-2.5 tabular-nums">{check.latencyMs === null ? "—" : `${check.latencyMs} ms`}</TableCell>
                <TableCell className="whitespace-normal break-words px-4 py-2.5">{check.error ?? (check.statusCode ? `HTTP ${check.statusCode}` : "OK")}</TableCell>
              </TableRow>
            ))}
            {page.checks.length === 0 && (
              <TableRow><TableCell colSpan={4} className="px-4 py-6 text-center text-ink-dim">No checks match.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => go(1)} disabled={atStart} aria-label="First page" title="First page">
            <ChevronsLeft aria-hidden size={16} className={iconClass} />
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => go(page.page - 1)} disabled={atStart} aria-label="Previous page" title="Previous page">
            <ChevronLeft aria-hidden size={16} className={iconClass} />
          </Button>
        </div>
        <span className="text-xs tabular-nums text-ink-soft">Page {page.page} of {page.pageCount}</span>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => go(page.page + 1)} disabled={atEnd} aria-label="Next page" title="Next page">
            <ChevronRight aria-hidden size={16} className={iconClass} />
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => go(page.pageCount)} disabled={atEnd} aria-label="Last page" title="Last page">
            <ChevronsRight aria-hidden size={16} className={iconClass} />
          </Button>
        </div>
      </div>
      {selected && <CheckDetail name={name} check={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

/** History button that opens the paginated check history; available to read-only members too. `labelled` shows the word next to the icon. */
export function MonitorHistoryDrawer({ monitorId, name, latest, labelled = false }: { monitorId: string; name: string; latest: MonitorCheck[]; labelled?: boolean }) {
  const [open, setOpen] = useState(false);
  // The list already holds the newest checks, so something renders before the first request returns.
  const firstPage: HistoryPage = { checks: latest.slice(0, PAGE_SIZE), page: 1, pageCount: 1, total: latest.length };
  return (
    <>
      <Button type="button" data-button-guard="off" variant="ghost" size={labelled ? "sm" : "icon"} className={labelled ? undefined : "size-8 [&_svg]:!text-ink-soft"} onClick={() => setOpen(true)} aria-label={`Check history for ${name}`} title="Check history">
        <History aria-hidden size={labelled ? 14 : 15} />
        {labelled && "History"}
      </Button>
      {open && (
        <Drawer title={`${name} history`} subtitle={`Newest first, ${PAGE_SIZE} checks per page.`} onClose={() => setOpen(false)}>
          <CheckHistory monitorId={monitorId} name={name} firstPage={firstPage} />
        </Drawer>
      )}
    </>
  );
}

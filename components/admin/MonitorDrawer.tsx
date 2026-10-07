"use client";

import { useCallback, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, History, Pencil, Plus, RefreshCw, X } from "lucide-react";
import { HeartbeatTokenManager } from "@/components/admin/HeartbeatTokenManager";
import { MonitorForm, type MonitorFormValues } from "@/components/admin/MonitorForm";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions, DialogSurface, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchWithTimeout } from "@/lib/client-fetch";
import type { MonitorCheckCursor, MonitorCheckView } from "@/lib/monitor-checks";

export type MonitorCheck = MonitorCheckView;

/** Right-side panel shell shared by the edit and history drawers. */
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

/**
 * Add or edit a monitor in a right-side drawer so the monitors list stays one
 * line per monitor. Without `monitor` it renders the "Add monitor" trigger.
 */
export function MonitorDrawer({
  action,
  components,
  monitor,
}: {
  action: (formData: FormData) => Promise<void>;
  components: { id: string; name: string }[];
  monitor?: MonitorFormValues;
}) {
  const [open, setOpen] = useState(false);
  // A fresh key per opening resets the form after a successful save.
  const [session, setSession] = useState(0);
  const show = () => { setSession((value) => value + 1); setOpen(true); };

  return (
    <>
      {monitor ? (
        <Button type="button" data-button-guard="off" variant="ghost" size="icon" className="size-8 [&_svg]:!text-primary-ink" onClick={show} aria-label={`Edit ${monitor.name}`} title="Edit">
          <Pencil aria-hidden size={15} />
        </Button>
      ) : (
        <Button type="button" data-button-guard="off" onClick={show}>
          <Plus aria-hidden size={16} />
          Add monitor
        </Button>
      )}
      {open && (
        <Drawer title={monitor ? `Edit ${monitor.name}` : "Add a monitor"} subtitle={monitor ? undefined : "Fill in the basics; open a section only when you need it."} onClose={() => setOpen(false)}>
          <div className="space-y-4">
            {monitor?.type === "HEARTBEAT" && <HeartbeatTokenManager monitorId={monitor.id} />}
            <MonitorForm key={session} action={action} components={components} monitor={monitor} onSuccess={() => setOpen(false)} />
          </div>
        </Drawer>
      )}
    </>
  );
}

/** Matches MONITOR_CHECK_PAGE_SIZE in lib/monitor-checks (a server module). */
const PAGE_SIZE = 25;

type HistoryPage = { checks: MonitorCheck[]; nextCursor: MonitorCheckCursor | null };

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
        </dl>
        <DialogActions><Button type="button" variant="secondary" onClick={onClose}>Close</Button></DialogActions>
      </DialogSurface>
    </Dialog>,
    document.body,
  );
}

/** Check history, paged on the server by keyset cursor; visited pages are cached so Newer is instant. */
function CheckHistory({ monitorId, name, firstPage }: { monitorId: string; name: string; firstPage: HistoryPage }) {
  const [pages, setPages] = useState<HistoryPage[]>([firstPage]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MonitorCheck | null>(null);

  const load = useCallback(async (cursor: MonitorCheckCursor | null, target: number) => {
    setLoading(true);
    setError(null);
    try {
      const query = cursor ? `?${new URLSearchParams({ beforeAt: cursor.checkedAt, beforeId: cursor.id })}` : "";
      const response = await fetchWithTimeout(`/api/admin/monitors/${monitorId}/checks${query}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message ?? "Could not load check history");
      setPages((current) => [...current.slice(0, target), data as HistoryPage]);
      setIndex(target);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load check history");
    } finally {
      setLoading(false);
    }
  }, [monitorId]);

  const page = pages[index];
  const older = () => (pages[index + 1] ? setIndex(index + 1) : page?.nextCursor && load(page.nextCursor, index + 1));
  const refresh = () => void load(null, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-ink-dim" aria-live="polite">
          {page ? `Page ${index + 1} · ${page.checks.length} checks` : loading ? "Loading…" : ""}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw aria-hidden size={14} />
          Latest
        </Button>
      </div>
      {error && <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-xs text-danger-fg">{error}</p>}
      <div className="overflow-x-auto">
        <Table className="min-w-[30rem]" aria-busy={loading}>
          <TableHeader>
            <TableRow><TableHead>Checked</TableHead><TableHead>Result</TableHead><TableHead>Latency</TableHead><TableHead>Response</TableHead></TableRow>
          </TableHeader>
          <TableBody className={loading ? "opacity-60" : undefined}>
            {page?.checks.map((check) => (
              <TableRow key={check.id} tabIndex={0} className="cursor-pointer" onClick={() => setSelected(check)} onKeyDown={(event) => { if (event.key === "Enter") setSelected(check); }}>
                <TableCell className="whitespace-nowrap px-4 py-2.5 tabular-nums">{new Date(check.checkedAt).toLocaleString()}</TableCell>
                <TableCell className="px-4 py-2.5"><StatusBadge tone={check.ok ? "ok" : "danger"}>{check.ok ? "Up" : "Down"}</StatusBadge></TableCell>
                <TableCell className="px-4 py-2.5 tabular-nums">{check.latencyMs === null ? "—" : `${check.latencyMs} ms`}</TableCell>
                <TableCell className="max-w-56 truncate px-4 py-2.5" title={check.error ?? undefined}>{check.error ?? (check.statusCode ? `HTTP ${check.statusCode}` : "OK")}</TableCell>
              </TableRow>
            ))}
            {page && page.checks.length === 0 && (
              <TableRow><TableCell colSpan={4} className="px-4 py-6 text-center text-ink-dim">No checks have run yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => setIndex(index - 1)} disabled={loading || index === 0}>
          <ChevronLeft aria-hidden size={14} />
          Newer
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={older} disabled={loading || !page || (!page.nextCursor && !pages[index + 1])}>
          Older
          <ChevronRight aria-hidden size={14} />
        </Button>
      </div>
      {selected && <CheckDetail name={name} check={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

/** History icon that opens the paginated check history; available to read-only members too. */
export function MonitorHistoryDrawer({ monitorId, name, latest }: { monitorId: string; name: string; latest: MonitorCheck[] }) {
  const [open, setOpen] = useState(false);
  // The list already holds the newest checks, so the first page needs no request.
  const firstPage: HistoryPage = {
    checks: latest.slice(0, PAGE_SIZE),
    nextCursor: latest.length > PAGE_SIZE ? { checkedAt: latest[PAGE_SIZE - 1].checkedAt, id: latest[PAGE_SIZE - 1].id } : null,
  };
  return (
    <>
      <Button type="button" data-button-guard="off" variant="ghost" size="icon" className="size-8 [&_svg]:!text-ink-soft" onClick={() => setOpen(true)} aria-label={`Check history for ${name}`} title="Check history">
        <History aria-hidden size={15} />
      </Button>
      {open && (
        <Drawer title={`${name} history`} subtitle={`Newest first, ${PAGE_SIZE} checks per page.`} onClose={() => setOpen(false)}>
          <CheckHistory monitorId={monitorId} name={name} firstPage={firstPage} />
        </Drawer>
      )}
    </>
  );
}

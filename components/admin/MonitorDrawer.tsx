"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Pencil, Plus, X } from "lucide-react";
import { HeartbeatTokenManager } from "@/components/admin/HeartbeatTokenManager";
import { MonitorForm, type MonitorFormValues } from "@/components/admin/MonitorForm";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type MonitorCheck = { id: string; checkedAt: string; ok: boolean; statusCode: number | null; latencyMs: number | null; error: string | null };

function CheckHistory({ checks }: { checks: MonitorCheck[] }) {
  return (
    <Table className="min-w-[30rem]">
      <TableHeader>
        <TableRow><TableHead>Checked</TableHead><TableHead>Result</TableHead><TableHead>Latency</TableHead><TableHead>Response</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        {checks.map((check) => (
          <TableRow key={check.id}>
            <TableCell className="whitespace-nowrap px-4 py-2.5 tabular-nums">{new Date(check.checkedAt).toLocaleString()}</TableCell>
            <TableCell className="px-4 py-2.5"><StatusBadge tone={check.ok ? "ok" : "danger"}>{check.ok ? "Up" : "Down"}</StatusBadge></TableCell>
            <TableCell className="px-4 py-2.5 tabular-nums">{check.latencyMs === null ? "—" : `${check.latencyMs} ms`}</TableCell>
            <TableCell className="max-w-56 truncate px-4 py-2.5" title={check.error ?? undefined}>{check.error ?? (check.statusCode ? `HTTP ${check.statusCode}` : "OK")}</TableCell>
          </TableRow>
        ))}
        {checks.length === 0 && (
          <TableRow><TableCell colSpan={4} className="px-4 py-6 text-center text-ink-dim">No checks have run yet.</TableCell></TableRow>
        )}
      </TableBody>
    </Table>
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
  checks = [],
}: {
  action: (formData: FormData) => Promise<void>;
  components: { id: string; name: string }[];
  monitor?: MonitorFormValues;
  checks?: MonitorCheck[];
}) {
  const [open, setOpen] = useState(false);
  // A fresh key per opening resets the form after a successful save.
  const [session, setSession] = useState(0);
  const [tab, setTab] = useState<"settings" | "history">("settings");
  const show = () => { setSession((value) => value + 1); setTab("settings"); setOpen(true); };

  const trigger = monitor ? (
    <Button type="button" data-button-guard="off" variant="ghost" size="icon" className="size-8 [&_svg]:!text-primary-ink" onClick={show} aria-label={`Edit ${monitor.name}`} title="Edit">
      <Pencil aria-hidden size={15} />
    </Button>
  ) : (
    <Button type="button" data-button-guard="off" onClick={show}>
      <Plus aria-hidden size={16} />
      Add monitor
    </Button>
  );

  const tabButton = (value: typeof tab, label: ReactNode) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === value}
      onClick={() => setTab(value)}
      className={cn("border-b-2 px-1 pb-2 text-sm font-medium transition-colors", tab === value ? "border-primary text-ink" : "border-transparent text-ink-dim hover:text-ink")}
    >
      {label}
    </button>
  );

  return (
    <>
      {trigger}
      {open && createPortal(
        <Dialog open={open} onOpenChange={(_event, data) => setOpen(data.open)}>
          <div role="dialog" aria-modal="true" aria-labelledby="monitor-drawer-title" className="-m-4 flex h-dvh w-full max-w-xl animate-pop flex-col justify-self-end border-l border-line bg-surface text-ink shadow-float">
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 pb-0 pt-5">
              <div className="min-w-0 space-y-3">
                <div id="monitor-drawer-title"><DialogTitle>{monitor ? `Edit ${monitor.name}` : "Add a monitor"}</DialogTitle></div>
                {monitor ? (
                  <div role="tablist" className="flex gap-5">
                    {tabButton("settings", "Settings")}
                    {tabButton("history", `History (${checks.length})`)}
                  </div>
                ) : (
                  <p className="pb-4 text-sm text-ink-soft">Fill in the basics; open a section only when you need it.</p>
                )}
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={() => setOpen(false)} className="-mr-2 -mt-1 shrink-0">
                <X aria-hidden size={16} />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
              {tab === "history" && monitor ? (
                <div className="overflow-x-auto"><CheckHistory checks={checks} /></div>
              ) : (
                <div className="space-y-4">
                  {monitor?.type === "HEARTBEAT" && <HeartbeatTokenManager monitorId={monitor.id} />}
                  <MonitorForm key={session} action={action} components={components} monitor={monitor} onSuccess={() => setOpen(false)} />
                </div>
              )}
            </div>
          </div>
        </Dialog>,
        document.body,
      )}
    </>
  );
}

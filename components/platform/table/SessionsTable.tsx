"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Laptop, LogOut, MonitorSmartphone, Search, Smartphone } from "lucide-react";
import { ClientPager } from "@/components/platform/table/ClientPager";
import { ActionDialog, type DialogRequest } from "@/components/platform/table/ActionDialog";
import { ago, formatDateTime } from "@/components/platform/table/format";
import { BulkBar, SelectAll, useSelection } from "@/components/platform/table/selection";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

type Session = { id: string; current: boolean; authMethod: string; mfaVerified: boolean; ipAddress: string | null; userAgent: string | null; createdAt: string; lastSeenAt: string };
const guard = { "data-button-busy-mode": "interaction" } as const;

async function fetchSessions(): Promise<Session[] | null> {
  const response = await fetchWithTimeout("/api/auth/sessions").catch(() => null);
  return response?.ok ? ((await response.json()).sessions ?? []) : null;
}

/** The devices signed in to your account, as a table with inline and bulk revoke. Signing out the current device returns you to sign-in. */
export function SessionsTable() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [now, setNow] = useState(0);
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const [q, setQ] = useState("");
  const [size, setSize] = useState(10);
  const [pageNumber, setPageNumber] = useState(1);
  const needle = q.trim().toLowerCase();
  const matching = [...(sessions ?? [])].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)).filter((session) => !needle || `${session.authMethod} ${session.ipAddress ?? ""} ${session.userAgent ?? ""}`.toLowerCase().includes(needle));
  const lastPage = Math.max(1, Math.ceil(matching.length / size));
  const page = Math.min(pageNumber, lastPage);
  const visible = matching.slice((page - 1) * size, page * size);
  const selection = useSelection(visible.map((session) => session.id));
  const chosen = visible.filter((session) => selection.has(session.id));

  const apply = useCallback((list: Session[] | null) => { setSessions((previous) => list ?? previous ?? []); setNow(Date.now()); }, []);
  useEffect(() => { void fetchSessions().then(apply); }, [apply]);

  function revoke(targets: Session[]) {
    if (targets.length === 0) return;
    const many = targets.length > 1;
    const includesCurrent = targets.some((session) => session.current);
    setDialog({
      title: many ? `Revoke ${targets.length} sessions?` : "Revoke this session?", tone: "danger", confirmLabel: many ? `Revoke ${targets.length}` : "Revoke",
      warning: includesCurrent ? "This includes the device you are using now. You will be signed out here too and sent to the sign-in page." : "Each device is signed out immediately and must sign in again.",
      subjects: targets.map((session) => `${session.authMethod} · ${session.ipAddress ?? "IP unavailable"}${session.current ? " (this device)" : ""}`),
      run: async () => {
        let failed = 0;
        for (const session of targets) {
          const response = await fetchWithTimeout(`/api/auth/sessions?id=${session.id}`, { method: "DELETE" }).catch(() => null);
          if (!response?.ok) failed += 1;
        }
        if (includesCurrent && failed === 0) { router.replace("/login"); return; }
        apply(await fetchSessions());
        selection.clear();
        if (failed === targets.length) return "The sessions could not be revoked. Try again.";
        toast(failed ? `Revoked ${targets.length - failed}. ${failed} could not be revoked.` : `Revoked ${targets.length} ${many ? "sessions" : "session"}.`, failed ? "warn" : "ok");
      },
    });
  }

  if (sessions === null) return <Card className="p-8 text-center text-sm text-ink-soft" aria-busy="true">Loading sessions…</Card>;
  const others = sessions.filter((session) => !session.current);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-ink">Active sessions</h2>
          <p className="text-sm text-ink-soft">Devices currently signed in to your account. Revoke any you do not recognise.</p>
        </div>
        {others.length > 0 && <Button {...guard} size="sm" variant="secondary" onClick={() => revoke(others)}><LogOut aria-hidden size={14} />Sign out other devices ({others.length})</Button>}
      </div>
      {sessions.length > 0 && (
        <div className="px-4 pb-4">
          <div className="relative max-w-sm">
            <Search aria-hidden size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim" />
            <Input value={q} aria-label="Search sessions" placeholder="Search device or IP…" maxLength={100} className="pl-9" onChange={(event) => { setQ(event.target.value); setPageNumber(1); }} />
          </div>
        </div>
      )}
      {matching.length === 0 ? (
        <EmptyState icon={MonitorSmartphone} hue="violet" title={sessions.length === 0 ? "No active sessions" : "No sessions match this search"} description={sessions.length === 0 ? "Signed-in devices appear here." : "Try a different device or IP address."} className="m-4 border-dashed bg-transparent py-12" />
      ) : (
        <>
          <BulkBar count={chosen.length} noun="session" onClear={selection.clear}>
            <Button {...guard} size="sm" variant="destructive" onClick={() => revoke(chosen)}><LogOut aria-hidden size={14} />Revoke ({chosen.length})</Button>
          </BulkBar>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 pr-0"><SelectAll label="Select all sessions on this page" total={visible.length} count={chosen.length} onChange={selection.setAll} /></TableHead>
                <TableHead>Device</TableHead>
                <TableHead className="max-sm:hidden">IP address</TableHead>
                <TableHead className="max-md:hidden">Signed in</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead className="!text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((session) => {
                const Icon = /mobile|android|iphone|ipad/i.test(session.userAgent ?? "") ? Smartphone : Laptop;
                return (
                  <TableRow key={session.id} className={cn("odd:bg-surface even:bg-sunken/45", selection.has(session.id) && "!bg-primary-soft/70")}>
                    <TableCell className="w-12 pr-0"><Checkbox aria-label={`Select ${session.authMethod} session from ${session.ipAddress ?? "unknown IP"}`} checked={selection.has(session.id)} onChange={() => selection.toggle(session.id)} /></TableCell>
                    <TableCell>
                      <div className="flex min-w-0 items-start gap-3">
                        <span aria-hidden className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-control bg-sunken text-ink-soft"><Icon size={16} /></span>
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 font-medium text-ink">{session.authMethod}{session.current && <StatusBadge tone="info">Current</StatusBadge>}{session.mfaVerified && <StatusBadge tone="ok">MFA</StatusBadge>}</p>
                          <p className="max-w-xs truncate text-xs text-ink-dim" title={session.userAgent ?? undefined}>{session.userAgent ?? "User agent unavailable"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs max-sm:hidden">{session.ipAddress ?? "Unavailable"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs max-md:hidden">{formatDateTime(session.createdAt)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs"><span className="block text-ink">{ago(session.lastSeenAt, now)}</span><span className="block text-ink-dim max-lg:hidden">{formatDateTime(session.lastSeenAt)}</span></TableCell>
                    <TableCell className="text-center"><Button {...guard} size="sm" variant="ghost" aria-label={`Revoke ${session.authMethod} session from ${session.ipAddress ?? "unknown IP"}`} onClick={() => revoke([session])} className="hover:!bg-danger-bg hover:!text-danger-fg"><LogOut aria-hidden size={14} /><span className="max-sm:sr-only">Revoke</span></Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </>
      )}
      {matching.length > 0 && <ClientPager total={matching.length} page={page} size={size} noun="session" onPage={setPageNumber} onSize={(next) => { setSize(next); setPageNumber(1); }} />}
      <ActionDialog request={dialog} onClose={() => setDialog(null)} />
    </Card>
  );
}

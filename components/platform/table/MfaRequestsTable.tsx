"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ShieldAlert, X } from "lucide-react";
import { approveMfaRequest, breakGlassMfaRequest, rejectMfaRequest, type MfaActionResult } from "@/app/platform/(protected)/mfa-requests/actions";
import { formatDate, formatDateTime, words } from "@/components/platform/table/format";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions, DialogSurface } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

export type MfaRequestRowView = {
  id: string; userId: string; type: "REMOVE_ALL" | "LOST_DEVICE"; reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "EXPIRED";
  ipAddress: string | null; userAgent: string | null; createdAt: string; expiresAt: string; decidedAt: string | null;
  decisionNote: string | null; breakGlass: boolean; overdue: boolean;
  username: string; email: string; name: string; accountCreatedAt: string; deciderUsername: string | null;
  self: boolean;
};

const TONE = { PENDING: "warn", APPROVED: "ok", REJECTED: "danger", CANCELLED: "neutral", EXPIRED: "neutral" } as const;

/** A short browser and system label from a user-agent string; the full string is the tooltip. */
function browser(userAgent: string | null) {
  if (!userAgent) return "Unknown browser";
  const name = /Edg\//.test(userAgent) ? "Edge" : /Firefox\//.test(userAgent) ? "Firefox" : /Chrome\//.test(userAgent) ? "Chrome" : /Safari\//.test(userAgent) ? "Safari" : "Browser";
  const system = /Windows/.test(userAgent) ? "Windows" : /Mac OS X/.test(userAgent) ? "macOS" : /Android/.test(userAgent) ? "Android" : /iPhone|iPad/.test(userAgent) ? "iOS" : /Linux/.test(userAgent) ? "Linux" : "";
  return system ? `${name} on ${system}` : name;
}

const ageInDays = (iso: string, now: number) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000));

type Decision = { kind: "approve" | "reject" | "break-glass"; row: MfaRequestRowView };

function DecisionDialog({ decision, onClose, onDone }: { decision: Decision; onClose: () => void; onDone: () => void }) {
  const { kind, row } = decision;
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    let result: MfaActionResult;
    try {
      result = kind === "approve" ? await approveMfaRequest({ requestId: row.id, code })
        : kind === "reject" ? await rejectMfaRequest({ requestId: row.id, code, note })
          : await breakGlassMfaRequest({ requestId: row.id, password, confirm });
    } catch {
      result = { ok: false, message: "The action could not be completed. Reload and try again." };
    }
    setBusy(false);
    if (result.ok) onDone(); else setError(result.message);
  }

  const ready = kind === "break-glass" ? password.length > 0 && confirm.trim().toUpperCase() === "BREAK GLASS"
    : code.length === 6 && (kind === "approve" || note.trim().length >= 3);
  const title = kind === "approve" ? "Approve MFA removal?" : kind === "reject" ? "Reject this request?" : "Break-glass: remove your own MFA";

  return (
    <Dialog open onOpenChange={() => { if (!busy) onClose(); }}>
      <DialogSurface className="max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
          <p className="text-sm text-ink-soft"><strong className="text-ink">{row.name}</strong> · {row.email}</p>
          {kind === "approve" && (
            <Alert tone="warn">All of their devices and recovery codes are deleted, they are signed out everywhere (trusted browsers too), and they must set up a new authenticator at next sign-in. This cannot be undone. They are emailed.</Alert>
          )}
          {kind === "break-glass" && (
            <Alert tone="danger" title="Emergency use only">You are the only administrator, so nobody else can approve this. It is recorded in the audit log as MFA_BREAK_GLASS and the account owner is emailed. You will be signed out and must set up a new authenticator.</Alert>
          )}
          {kind === "reject" && (
            <Field label="Note for the user" htmlFor="mfa-reject-note" required hint="They receive this by email and can file again after 24 hours.">
              <Textarea id="mfa-reject-note" rows={3} value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} autoFocus />
            </Field>
          )}
          {kind !== "break-glass" ? (
            <Field label="Your own authenticator code" htmlFor="mfa-decision-code" required hint="Confirms it is really you approving.">
              <Input id="mfa-decision-code" value={code} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
            </Field>
          ) : (
            <>
              <Field label="Your password" htmlFor="mfa-bg-password" required><Input id="mfa-bg-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus /></Field>
              <Field label={<>Type <code className="rounded-chip bg-sunken px-1.5 py-0.5 font-mono text-xs text-ink">BREAK GLASS</code> to confirm</>} htmlFor="mfa-bg-confirm" required>
                <Input id="mfa-bg-confirm" value={confirm} autoComplete="off" spellCheck={false} onChange={(event) => setConfirm(event.target.value)} />
              </Field>
            </>
          )}
          {error && <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg">{error}</p>}
          <DialogActions>
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" variant={kind === "approve" ? "default" : "destructive"} loading={busy} disabled={!ready}>{kind === "approve" ? "Approve and remove MFA" : kind === "reject" ? "Reject request" : "Use break-glass"}</Button>
          </DialogActions>
        </form>
      </DialogSurface>
    </Dialog>
  );
}

export function MfaRequestsTable({ rows, soleAdmin, filtered, now }: { rows: MfaRequestRowView[]; soleAdmin: boolean; filtered: boolean; now: number }) {
  const router = useRouter();
  const [decision, setDecision] = useState<Decision | null>(null);

  if (rows.length === 0) {
    return <EmptyState icon={ShieldAlert} hue="violet" title={filtered ? "No requests with this status" : "No MFA requests"} description="Requests appear here when someone asks to remove their authenticator." className="m-4 border-dashed bg-transparent py-12" />;
  }
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>User</TableHead>
            <TableHead>Request</TableHead>
            <TableHead className="max-lg:hidden">Source</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="!text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className="odd:bg-surface even:bg-sunken/45 align-top">
              <TableCell>
                <p className="font-medium text-ink">{row.name}</p>
                <p className="text-xs text-ink-soft">{row.email}</p>
                <p className="font-mono text-2xs text-ink-dim">{row.username}</p>
                <p className="mt-1 text-2xs text-ink-dim">Account {ageInDays(row.accountCreatedAt, now)} days old</p>
              </TableCell>
              <TableCell className="max-w-xs">
                <StatusBadge tone={row.type === "LOST_DEVICE" ? "warn" : "info"}>{row.type === "LOST_DEVICE" ? "Lost device" : "Remove all"}</StatusBadge>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-ink">{row.reason}</p>
                <p className="mt-1 text-2xs text-ink-dim">{formatDateTime(row.createdAt)}</p>
              </TableCell>
              <TableCell className="text-xs max-lg:hidden">
                <p className="font-mono">{row.ipAddress ?? "Unknown IP"}</p>
                <p className="text-ink-soft" title={row.userAgent ?? undefined}>{browser(row.userAgent)}</p>
              </TableCell>
              <TableCell>
                <StatusBadge tone={TONE[row.status]}>{words(row.status)}</StatusBadge>
                {row.overdue && <StatusBadge tone="danger" className="ml-1.5"><AlertTriangle aria-hidden size={11} className="mr-1 inline" />Overdue</StatusBadge>}
                {row.status === "PENDING" && <p className="mt-1 text-2xs text-ink-dim">Expires {formatDate(row.expiresAt)}</p>}
                {row.status !== "PENDING" && row.decidedAt && <p className="mt-1 text-2xs text-ink-dim">{formatDate(row.decidedAt)}{row.deciderUsername ? ` by ${row.deciderUsername}` : ""}{row.breakGlass ? " · break-glass" : ""}</p>}
                {row.decisionNote && <p className="mt-1 max-w-48 break-words text-2xs text-ink-soft">Note: {row.decisionNote}</p>}
              </TableCell>
              <TableCell className="text-center">
                {row.status === "PENDING" ? (
                  <div className="inline-flex flex-wrap items-center justify-center gap-1.5">
                    {row.self ? (
                      soleAdmin
                        ? <Button size="sm" variant="destructive" onClick={() => setDecision({ kind: "break-glass", row })}><AlertTriangle aria-hidden size={14} />Break-glass</Button>
                        : <span className="text-xs text-ink-dim">Another admin must decide</span>
                    ) : (
                      <>
                        <Button size="sm" onClick={() => setDecision({ kind: "approve", row })}><Check aria-hidden size={14} />Approve</Button>
                        <Button size="sm" variant="secondary" onClick={() => setDecision({ kind: "reject", row })}><X aria-hidden size={14} />Reject</Button>
                      </>
                    )}
                  </div>
                ) : <span className="text-xs text-ink-dim">—</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {decision && <DecisionDialog decision={decision} onClose={() => setDecision(null)} onDone={() => { setDecision(null); router.refresh(); }} />}
    </>
  );
}

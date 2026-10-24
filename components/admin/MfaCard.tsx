"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { KeyRound, Pencil, Plus, RefreshCw, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { mfaAction, mfaCall } from "@/components/auth/mfa-client";
import { MfaEnrollment } from "@/components/auth/MfaEnrollment";
import { RecoveryCodesPanel } from "@/components/auth/RecoveryCodesPanel";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { IconTile } from "@/components/ui/icon-tile";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";

type Device = { id: string; name: string; createdAt: string; lastUsedAt: string | null };
type RequestState = {
  pending: { id: string; type: string; createdAt: string; expiresAt: string } | null;
  cooldownUntil: string | null;
  lastRejectedNote: string | null;
};
type Status = {
  canManageRequests: boolean;
  globalEnabled: boolean;
  request: RequestState | null;
  devices: Device[];
  canAdd: boolean;
  recoveryCodesRemaining: number;
  emailAvailable: boolean;
};
type Mode =
  | { kind: "idle" }
  | { kind: "add-code" }
  | { kind: "add"; reason?: string }
  | { kind: "delete"; device: Device }
  | { kind: "regenerate" }
  | { kind: "removal" }
  | { kind: "codes"; codes: string[]; reason?: string };

const day = (value: string | null) => (value ? new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" }) : "never");

/** Administrators give an audit reason; other users verify a fresh code. */
function ChangePrompt({ isAdmin = false, title, confirmLabel, destructive, onSubmit, onCancel }: {
  isAdmin?: boolean; title: ReactNode; confirmLabel: string; destructive?: boolean; onSubmit: (code: string) => Promise<string | null>; onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    setError(await onSubmit(isAdmin ? reason.trim() : code));
    setBusy(false);
  }
  return (
    <div className="space-y-3 rounded-control bg-sunken p-4">
      <p className="text-sm text-ink-soft">{title}</p>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex flex-wrap items-end gap-3">
        {isAdmin ? <Field label="Reason" htmlFor="mfa-change-reason" required hint="5 to 500 characters. Included in the audit log." className="w-full">
          <Textarea id="mfa-change-reason" value={reason} autoFocus required minLength={5} maxLength={500} rows={3} onChange={(event) => setReason(event.target.value)} />
        </Field> : <Field label="Code from your app" htmlFor="mfa-fresh-code" className="w-full sm:w-52">
          <Input id="mfa-fresh-code" value={code} autoFocus onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" />
        </Field>}
        <Button type="button" variant={destructive ? "destructive" : "default"} loading={busy} disabled={isAdmin ? reason.trim().length < 5 : code.length !== 6} onClick={() => void submit()}>{confirmLabel}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

/** Files a removal request; administrators need only an audit reason. */
function RemovalPrompt({ canManageRequests, onDone, onCancel }: { canManageRequests: boolean; onDone: () => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    const result = await mfaAction("request-removal", { reason, ...(canManageRequests ? {} : { code }) });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    toast("Request sent. You'll get an email when an administrator decides.", "ok");
    onDone();
  }
  return (
    <div className="space-y-3 rounded-control bg-sunken p-4">
      <p className="text-sm text-ink-soft">An administrator must review this request. Approval deletes all your devices and recovery codes, signs you out everywhere, and requires a new authenticator at your next sign-in.</p>
      {canManageRequests && <p className="text-sm text-ink-soft">After sending, open <Link className="font-medium text-primary-ink underline underline-offset-2" href="/organization/platform/mfa-requests">MFA requests</Link> to review it. If you are the only administrator, use Break-glass there with your password and a typed confirmation.</p>}
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Reason" htmlFor="mfa-removal-reason" required hint="At least 5 characters. This is included in the audit log."><Textarea id="mfa-removal-reason" value={reason} onChange={(event) => setReason(event.target.value)} minLength={5} maxLength={500} rows={3} /></Field>
      <div className="flex flex-wrap items-end gap-3">
        {!canManageRequests && <Field label="Code from your app" htmlFor="mfa-removal-code" required hint="Enter the current 6-digit code to confirm this request." className="w-full sm:w-52">
          <Input id="mfa-removal-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" />
        </Field>}
        <Button type="button" loading={busy} disabled={(!canManageRequests && code.length !== 6) || reason.trim().length < 5} onClick={() => void submit()}>Send request</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function DeviceRow({ device, canDelete, onDelete, onRenamed }: { device: Device; canDelete: boolean; onDelete: () => void; onRenamed: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(device.name);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const result = await mfaAction("rename", { deviceId: device.id, name });
    setBusy(false);
    if (!result.ok) return toast(result.error, "danger");
    setEditing(false);
    onRenamed();
  }
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Smartphone aria-hidden size={18} className="shrink-0 text-ink-soft" />
        <div className="min-w-0">
          {editing ? (
            <div className="flex items-center gap-2">
              <Input aria-label="Device name" value={name} maxLength={40} autoFocus onChange={(event) => setName(event.target.value)} className="h-8 w-48" />
              <Button type="button" size="sm" loading={busy} disabled={!name.trim()} onClick={() => void save()}>Save</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(false); setName(device.name); }}>Cancel</Button>
            </div>
          ) : (
            <p className="truncate text-sm font-medium text-ink">{device.name}</p>
          )}
          <p className="text-xs text-ink-dim">Added {day(device.createdAt)} · Last used {day(device.lastUsedAt)}</p>
        </div>
      </div>
      {!editing && (
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil aria-hidden size={14} />Rename</Button>
          <Button type="button" size="sm" variant="ghost" disabled={!canDelete} title={canDelete ? undefined : "You need at least one device"} onClick={onDelete}><Trash2 aria-hidden size={14} />Delete</Button>
        </div>
      )}
    </li>
  );
}

/** The signed-in user's authenticator MFA: up to two devices, recovery codes and removal. */
export function MfaCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });

  const refresh = useCallback(async () => {
    const result = await mfaCall<Status>("/api/auth/mfa");
    if (result.ok) setStatus(result.body);
  }, []);

  useEffect(() => {
    void mfaCall<Status>("/api/auth/mfa").then((result) => { if (result.ok) setStatus(result.body); });
  }, []);

  if (!status) return null;
  const { devices } = status;
  const enabled = devices.length > 0;
  const summary = !status.globalEnabled
    ? "Your administrator has turned MFA off for now. Your devices are kept."
    : enabled
      ? `Enabled · ${devices.length} ${devices.length === 1 ? "device" : "devices"} · ${status.recoveryCodesRemaining} recovery codes remain`
      : "Protect password sign-in with a code from an authenticator app.";

  async function cancelRequest(requestId: string) {
    const result = await mfaAction("cancel-request", { requestId });
    toast(result.ok ? "Request cancelled" : result.error, result.ok ? "ok" : "danger");
    await refresh();
  }

  async function stepUp(code: string, next: Mode) {
    const result = await mfaAction("stepup", { code });
    if (!result.ok) return result.error;
    setMode(next);
    return null;
  }

  const content = (() => {
    if (!status.globalEnabled) return null;
    if (mode.kind === "codes") {
      return <RecoveryCodesPanel reason={mode.reason} codes={mode.codes} emailAvailable={status.emailAvailable} continueLabel="Done"
        onContinue={async () => { await mfaAction("acknowledge"); setMode({ kind: "idle" }); await refresh(); }} />;
    }
    if (mode.kind === "add") {
      return <MfaEnrollment reason={mode.reason} emailAvailable={status.emailAvailable} continueLabel="Done"
        onCancel={() => setMode({ kind: "idle" })}
        onFinished={async () => { setMode({ kind: "idle" }); await refresh(); toast("Device added", "ok"); }} />;
    }
    return (
      <>
        {enabled && (
          <ul className="divide-y divide-line">
            {devices.map((device) => (
              <DeviceRow key={device.id} device={device} canDelete={devices.length > 1} onRenamed={() => void refresh()}
                onDelete={() => setMode({ kind: "delete", device })} />
            ))}
          </ul>
        )}
        {enabled && !status.request?.pending && !status.request?.cooldownUntil && mode.kind === "idle" && (
          <p className="text-xs text-ink-dim">You need at least one device. To remove all MFA, <button type="button" className="font-medium text-primary-ink underline-offset-4 hover:underline" onClick={() => setMode({ kind: "removal" })}>request removal</button>.</p>
        )}
        {mode.kind === "delete" && (
          <ChangePrompt isAdmin={status.canManageRequests} destructive confirmLabel="Delete device" onCancel={() => setMode({ kind: "idle" })}
            title={<>Delete <strong>{mode.device.name}</strong>. Trusted browsers will be signed out.</>}
            onSubmit={async (code) => {
              const result = await mfaAction("delete", { deviceId: mode.device.id, ...(status.canManageRequests ? { reason: code } : { code }) });
              if (!result.ok) return result.error;
              setMode({ kind: "idle" });
              await refresh();
              toast("Device deleted", "ok");
              return null;
            }} />
        )}
        {mode.kind === "add-code" && (
          <ChangePrompt isAdmin={status.canManageRequests} confirmLabel="Continue" onCancel={() => setMode({ kind: "idle" })}
            title={status.canManageRequests ? "Give a reason to add an authenticator, then scan the new QR code." : "Confirm it's you with a code from a device you already have, then scan the new QR code."}
            onSubmit={async (value) => {
              if (!status.canManageRequests) return stepUp(value, { kind: "add" });
              setMode({ kind: "add", reason: value });
              return null;
            }} />
        )}
        {mode.kind === "regenerate" && (
          <ChangePrompt isAdmin={status.canManageRequests} confirmLabel="Generate new codes" onCancel={() => setMode({ kind: "idle" })}
            title="Your current recovery codes stop working immediately when you generate new ones."
            onSubmit={async (code) => {
              const result = await mfaAction<{ recoveryCodes: string[] }>("regenerate", status.canManageRequests ? { reason: code } : { code });
              if (!result.ok) return result.error;
              setMode({ kind: "codes", codes: result.body.recoveryCodes, reason: status.canManageRequests ? code : undefined });
              return null;
            }} />
        )}
        {mode.kind === "removal" && (
          <RemovalPrompt canManageRequests={status.canManageRequests} onCancel={() => setMode({ kind: "idle" })} onDone={() => { setMode({ kind: "idle" }); void refresh(); }} />
        )}
        {status.request?.pending && (
          <Alert tone="info" title="MFA removal request waiting for an administrator">
            Sent {day(status.request.pending.createdAt)}, expires {day(status.request.pending.expiresAt)}. If your device works again, you can cancel it.
            {status.canManageRequests && <> Open <Link className="font-medium text-primary-ink underline underline-offset-2" href="/organization/platform/mfa-requests">MFA requests</Link> to review it. If you are the only administrator, use Break-glass there; it requires your password and a typed confirmation.</>}
            <div className="mt-2"><Button type="button" size="sm" variant="secondary" onClick={() => void cancelRequest(status.request!.pending!.id)}>Cancel request</Button></div>
          </Alert>
        )}
        {!status.request?.pending && status.request?.cooldownUntil && (
          <Alert tone="warn" title="Your last request was declined">
            {status.request.lastRejectedNote ? `Note: ${status.request.lastRejectedNote}. ` : ""}You can file a new one after {new Date(status.request.cooldownUntil).toLocaleString()}.
          </Alert>
        )}
        {enabled && status.recoveryCodesRemaining < 3 && (
          <Alert tone="warn" title={`Only ${status.recoveryCodesRemaining} recovery ${status.recoveryCodesRemaining === 1 ? "code" : "codes"} left`}>Generate new ones so you can still get in if you lose your device.</Alert>
        )}
        {mode.kind === "idle" && (
          <div className="flex flex-wrap gap-2">
            {!enabled && <Button type="button" onClick={() => setMode({ kind: status.canManageRequests ? "add-code" : "add" })}><KeyRound aria-hidden size={16} />Set up authenticator</Button>}
            {enabled && status.canAdd && <Button type="button" variant="secondary" onClick={() => setMode({ kind: "add-code" })}><Plus aria-hidden size={14} />Add device</Button>}
            {enabled && <Button type="button" variant="secondary" onClick={() => setMode({ kind: "regenerate" })}><RefreshCw aria-hidden size={14} />Regenerate recovery codes</Button>}
          </div>
        )}
        {enabled && !status.canAdd && mode.kind === "idle" && <p className="text-xs text-ink-dim">You have the maximum of 2 devices.</p>}
      </>
    );
  })();

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <IconTile icon={ShieldCheck} hue="rose" />
          <div className="min-w-0">
            <CardTitle>Authenticator MFA</CardTitle>
            <CardDescription>{summary}</CardDescription>
          </div>
        </div>
        <StatusBadge tone={!status.globalEnabled ? "neutral" : enabled ? "ok" : "warn"}>{!status.globalEnabled ? "Off" : enabled ? "Enabled" : "Not set up"}</StatusBadge>
      </CardHeader>
      {(content || status.canManageRequests) && <CardContent className="space-y-4">
        {status.canManageRequests && <p className="text-sm text-ink-soft">Global MFA is {status.globalEnabled ? "enabled" : "disabled"} for password sign-in. <Link href="/organization/platform/deployment#global-mfa" className="font-medium text-primary-ink underline underline-offset-2">Enable or disable global MFA</Link></p>}
        {content}
      </CardContent>}
    </Card>
  );
}

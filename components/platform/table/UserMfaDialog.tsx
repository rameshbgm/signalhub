"use client";

import { useEffect, useState } from "react";
import { ShieldOff, Smartphone, Trash2 } from "lucide-react";
import { deleteUserMfaDevice, listUserMfaDevices, resetUserMfa } from "@/app/platform/(protected)/mfa-requests/actions";
import { formatDate } from "@/components/platform/table/format";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions, DialogSurface } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type Device = { id: string; name: string; createdAt: string; lastUsedAt: string | null };

/**
 * An administrator's view of one person's authenticator devices: delete a single
 * device, or remove them all and force a new enrollment. Every change needs a
 * reason (audit log) and the administrator's own fresh code.
 */
export function UserMfaDialog({ user, onClose, onChanged }: { user: { id: string; name: string; email: string }; onClose: () => void; onChanged: () => void }) {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    void listUserMfaDevices(user.id).then(setDevices).catch(() => setError("Could not load the devices."));
  }, [user.id]);

  const ready = reason.trim().length >= 5 && code.length === 6;

  async function run(key: string, action: () => Promise<{ ok: boolean; message: string }>) {
    setBusy(key);
    setError("");
    const result = await action().catch(() => ({ ok: false, message: "The action could not be completed. Reload and try again." }));
    setBusy(null);
    setCode("");
    if (!result.ok) return setError(result.message);
    setDone(result.message);
    setDevices(await listUserMfaDevices(user.id).catch(() => null));
    onChanged();
  }

  return (
    <Dialog open onOpenChange={() => { if (!busy) onClose(); }}>
      <DialogSurface className="max-w-lg">
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-ink">Manage MFA</h2>
            <p className="text-sm text-ink-soft"><strong className="text-ink">{user.name}</strong> · {user.email}</p>
          </div>
          {done && <Alert tone="ok">{done}</Alert>}
          {error && <Alert tone="danger">{error}</Alert>}
          {devices === null ? <p className="text-sm text-ink-dim">Loading…</p> : devices.length === 0 ? (
            <p className="text-sm text-ink-soft">No authenticator devices. They set one up at their next sign-in.</p>
          ) : (
            <ul className="divide-y divide-line rounded-control border border-line">
              {devices.map((device) => (
                <li key={device.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Smartphone aria-hidden size={16} className="shrink-0 text-ink-soft" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{device.name}</p>
                      <p className="text-xs text-ink-dim">Added {formatDate(device.createdAt)} · Last used {device.lastUsedAt ? formatDate(device.lastUsedAt) : "never"}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" disabled={!ready || Boolean(busy)} loading={busy === device.id}
                    onClick={() => void run(device.id, () => deleteUserMfaDevice({ userId: user.id, deviceId: device.id, reason, code }))}>
                    <Trash2 aria-hidden size={14} />Delete
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Field label="Reason for the audit log" htmlFor="user-mfa-reason" required hint="At least 5 characters.">
            <Input id="user-mfa-reason" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <Field label="Your own authenticator code" htmlFor="user-mfa-code" required hint="Confirms it is really you. Needed for each change.">
            <Input id="user-mfa-code" value={code} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
          </Field>
          <Alert tone="warn">Deleting the last device, or resetting, signs the person out everywhere and makes them set up a new authenticator at next sign-in. Nothing here can be undone. They are emailed.</Alert>
          <DialogActions>
            <Button type="button" variant="secondary" onClick={onClose} disabled={Boolean(busy)}>Close</Button>
            <Button type="button" variant="destructive" disabled={!ready || Boolean(busy) || devices?.length === 0} loading={busy === "reset"}
              onClick={() => void run("reset", () => resetUserMfa({ userId: user.id, reason, code }))}>
              <ShieldOff aria-hidden size={14} />Reset all MFA
            </Button>
          </DialogActions>
        </div>
      </DialogSurface>
    </Dialog>
  );
}

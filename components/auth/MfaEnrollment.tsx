"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mfaAction } from "@/components/auth/mfa-client";
import { RecoveryCodesPanel } from "@/components/auth/RecoveryCodesPanel";
import { SecretField } from "@/components/admin/SecretReveal";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type Setup = { secret: string; uri: string; qr: string };

/**
 * Registers one authenticator: QR code and manual key, a typed code to prove it
 * works, then (for the first device) the one-time recovery codes. Until the code
 * is confirmed nothing is active, and an unfinished setup simply expires.
 * Each start produces a fresh secret, so a QR code is never reused on a second phone.
 */
export function MfaEnrollment({ emailAvailable, continueLabel, onFinished, onCancel, reason }: {
  reason?: string;
  emailAvailable: boolean;
  continueLabel: string;
  /** Called after the last step, with the response of the final "acknowledge" call when there were recovery codes. */
  onFinished: (acknowledged: Record<string, unknown> | null) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const started = useRef(false);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    setCode("");
    const result = await mfaAction<Setup>("start", { reason });
    setBusy(false);
    if (result.ok) setSetup(result.body);
    else setError(result.error);
  }, [reason]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void start();
  }, [start]);

  async function confirm() {
    setBusy(true);
    setError(null);
    const result = await mfaAction<{ first: boolean; recoveryCodes: string[] }>("confirm", { code, reason });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      if (result.code === "MFA_ENROLLMENT_EXPIRED") setSetup(null);
      return;
    }
    setSetup(null);
    if (result.body.recoveryCodes.length) setRecoveryCodes(result.body.recoveryCodes);
    else await onFinished(null);
  }

  async function acknowledge() {
    const result = await mfaAction("acknowledge");
    if (result.ok) await onFinished(result.body);
    else setError(result.error);
  }

  if (recoveryCodes) {
    return <RecoveryCodesPanel reason={reason} codes={recoveryCodes} emailAvailable={emailAvailable} continueLabel={continueLabel} onContinue={acknowledge} />;
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      {!setup && (
        <Button type="button" loading={busy} onClick={() => void start()}>{error ? "Start again" : "Preparing…"}</Button>
      )}
      {setup && (
        <>
          <ol className="list-decimal space-y-1 pl-5 text-sm leading-6 text-ink-soft">
            <li>Open an authenticator app: Google Authenticator, Microsoft Authenticator, Authy, 1Password or similar.</li>
            <li>Scan this QR code, or choose &ldquo;enter a setup key&rdquo; and type the key below.</li>
            <li>Type the 6-digit code the app shows to finish.</li>
          </ol>
          <div className="flex flex-col gap-4 rounded-control bg-sunken p-4 sm:flex-row sm:items-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local data: URL, nothing to optimise */}
            <img src={setup.qr} alt="QR code to add this account to your authenticator app" width={176} height={176} className="size-44 shrink-0 self-center rounded-control bg-white p-1" />
            <SecretField label="Can't scan? Enter this setup key" value={setup.secret} copyLabel="Copy key" className="min-w-0 flex-1" />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Code from your app" htmlFor="mfa-enroll-code" className="w-full sm:w-52">
              <Input id="mfa-enroll-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" />
            </Field>
            <Button type="button" loading={busy} disabled={code.length !== 6} onClick={() => void confirm()}>Confirm</Button>
            {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
          </div>
          <p className="text-xs text-ink-dim">Make sure your phone&rsquo;s time is set automatically. This setup expires in 10 minutes and is not active until you confirm a code.</p>
        </>
      )}
    </div>
  );
}

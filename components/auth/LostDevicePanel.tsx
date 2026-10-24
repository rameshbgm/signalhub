"use client";

import { useState } from "react";
import { mfaCall } from "@/components/auth/mfa-client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * "Can't access your device?" on the code step: use a recovery code, or ask an
 * administrator to remove the authenticators. The reply is the same generic
 * message whatever the details, so the form reveals nothing about accounts.
 */
export function LostDevicePanel({ username, password, onUseRecovery }: { username: string; password: string; onUseRecovery: () => void }) {
  const [asking, setAsking] = useState(false);
  const [identifier, setIdentifier] = useState(username);
  const [pass, setPass] = useState(password);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await mfaCall<{ message: string }>("/api/auth/mfa/request", { identifier, password: pass, reason });
    setBusy(false);
    if (result.ok) setMessage(result.body.message);
    else setError(result.error);
  }

  if (message) return <Alert tone="ok" title="Request sent">{message}</Alert>;

  return (
    <div className="space-y-3 rounded-control border border-line bg-sunken p-4">
      <p className="text-sm font-semibold text-ink">Can&rsquo;t access your device?</p>
      {!asking ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={onUseRecovery}>Use a recovery code</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setAsking(true)}>I lost my device</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-xs leading-5 text-ink-soft">An administrator reviews your request and will remove your authenticators. You will set up a new one at your next sign-in. We email the account owner so nobody can do this quietly.</p>
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Email or User ID" htmlFor="lost-identifier"><Input id="lost-identifier" value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" required /></Field>
          <Field label="Password" htmlFor="lost-password"><Input id="lost-password" type="password" value={pass} onChange={(event) => setPass(event.target.value)} autoComplete="current-password" required /></Field>
          <Field label="Why do you need this?" htmlFor="lost-reason" hint="For example: my phone was lost or reset."><Textarea id="lost-reason" value={reason} onChange={(event) => setReason(event.target.value)} minLength={5} maxLength={500} rows={3} required /></Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={busy}>Send request</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAsking(false)}>Back</Button>
          </div>
        </form>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { mfaCall } from "@/components/auth/mfa-client";
import { Shell } from "@/components/auth/PasswordRecovery";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const CLOSED: Record<string, string> = {
  APPROVED: "An administrator already approved this request, so it can no longer be cancelled. Sign in to set up a new authenticator, and tell your administrator if this was not you.",
  REJECTED: "This request was already declined. Nothing changed on the account.",
  CANCELLED: "This request was already cancelled. Nothing changed on the account.",
  EXPIRED: "This request expired. Nothing changed on the account.",
};

export function CancelMfaRequest({ token, username, status }: { token: string; username: string | null; status: string | null }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    const result = await mfaCall("/api/auth/mfa/cancel", { token });
    setBusy(false);
    if (result.ok) setDone(true);
    else setError(result.error);
  }

  if (!status) {
    return <Shell title="Link not valid" description="This link is not valid or was already used."><Alert tone="warn">If you did not make a request, no action is needed.</Alert></Shell>;
  }
  if (done) {
    return <Shell title="Request cancelled" description="The request to remove two-step verification was cancelled."><Alert tone="ok">Nothing was changed on the account. If you did not file it, consider changing your password.</Alert></Shell>;
  }
  if (status !== "PENDING") {
    return <Shell title="Nothing to cancel" description="This request is no longer waiting."><Alert tone="info">{CLOSED[status] ?? "This request is closed."}</Alert></Shell>;
  }
  return (
    <Shell title="This wasn’t me" description={<>Someone asked an administrator to remove two-step verification from <strong>{username}</strong>. Cancel it if you did not.</>}>
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="button" size="lg" variant="destructive" className="w-full" loading={busy} onClick={() => void cancel()}>Cancel this request</Button>
        <p className="text-xs leading-5 text-ink-dim">If this was you, do nothing. An administrator will review it.</p>
      </div>
    </Shell>
  );
}

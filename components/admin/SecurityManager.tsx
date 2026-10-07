"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";
import { useToast } from "@/components/ui/toast";

import { useEffect, useState } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { CopyButton } from "@/components/CopyButton";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, Laptop, LogIn, MonitorSmartphone, ShieldCheck, Smartphone } from "lucide-react";
import { SecretField } from "@/components/admin/SecretReveal";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { IconTile } from "@/components/ui/icon-tile";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";

type Session = {
  id: string;
  current: boolean;
  authMethod: string;
  mfaVerified: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
};

export function SecurityManager({ enrollmentRequired }: { enrollmentRequired: boolean }) {
  const router = useRouter();
  const [mfa, setMfa] = useState<{ enrolled: boolean; required: boolean; recoveryCodesRemaining: number } | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState<string | null>(null);
  useToast("danger", error);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  async function refresh() {
    const [mfaResponse, sessionResponse] = await Promise.all([
      fetchWithTimeout("/api/auth/mfa"),
      fetchWithTimeout("/api/auth/sessions"),
    ]);
    if (mfaResponse.ok) setMfa(await mfaResponse.json());
    if (sessionResponse.ok) setSessions((await sessionResponse.json()).sessions ?? []);
  }

  useEffect(() => {
    void Promise.all([fetchWithTimeout("/api/auth/mfa"), fetchWithTimeout("/api/auth/sessions")])
      .then(async ([mfaResponse, sessionResponse]) => {
        if (mfaResponse.ok) setMfa(await mfaResponse.json());
        if (sessionResponse.ok) setSessions((await sessionResponse.json()).sessions ?? []);
      });
  }, []);

  async function mfaAction(action: "start" | "confirm") {
    if (pendingAction) return;
    setPendingAction(action);
    setError(null);
    try {
      const response = await fetchWithTimeout("/api/auth/mfa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...(action === "confirm" ? { code } : {}) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error?.message ?? "MFA operation failed");
        return;
      }
      if (action === "start") {
        setSecret(body.secret);
        setUri(body.uri);
      } else {
        setRecoveryCodes(body.recoveryCodes ?? []);
        setSecret(null);
        setUri(null);
      }
    } catch {
      setError("MFA operation timed out. Check your connection and try again.");
    } finally {
      setPendingAction(null);
    }
  }

  async function revoke(id: string) {
    if (pendingAction || !(await confirm("Revoke this session immediately? That device is signed out.", { confirmLabel: "Revoke session" }))) return;
    setPendingAction(`revoke:${id}`);
    setError(null);
    try {
      const response = await fetchWithTimeout(`/api/auth/sessions?id=${id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error?.message ?? "Session revocation failed");
        return;
      }
      if (sessions.find((session) => session.id === id)?.current) router.replace("/login");
      else await refresh();
    } catch {
      setError("Session revocation timed out. Check your connection and try again.");
    } finally {
      setPendingAction(null);
    }
  }

  const mfaSummary = mfa?.enrolled
    ? `Enabled · ${mfa.recoveryCodesRemaining} recovery codes remain`
    : enrollmentRequired
      ? "Enrollment is required before administrative changes are allowed."
      : "Protect password sign-in with a time-based one-time code.";

  return (
    <div className="space-y-6">
      <Card className={enrollmentRequired && !mfa?.enrolled ? "ring-2 ring-warn/40" : undefined}>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <IconTile icon={ShieldCheck} hue="rose" />
            <div className="min-w-0">
              <CardTitle>Authenticator MFA</CardTitle>
              <CardDescription>{mfaSummary}</CardDescription>
            </div>
          </div>
          {mfa && <StatusBadge tone={mfa.enrolled ? "ok" : enrollmentRequired ? "warn" : "neutral"}>{mfa.enrolled ? "Enabled" : enrollmentRequired ? "Required" : "Not set up"}</StatusBadge>}
        </CardHeader>
        <CardContent className="space-y-4">
          {!mfa?.enrolled && !secret && (
            <Button type="button" loading={pendingAction === "start"} onClick={() => void mfaAction("start")}>
              <KeyRound aria-hidden size={16} />
              Start enrollment
            </Button>
          )}
          {secret && (
            <div className="space-y-4">
              <div className="rounded-control bg-sunken p-4">
                <p className="mb-3 text-sm text-ink-soft">Add this key or URI to your authenticator application:</p>
                <SecretField value={secret} copyValue={uri ?? secret} copyLabel="Copy setup URI" />
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Verification code" htmlFor="mfa-code" className="w-full sm:w-48">
                  <Input id="mfa-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code" inputMode="numeric" autoComplete="one-time-code" />
                </Field>
                <Button type="button" loading={pendingAction === "confirm"} disabled={code.length !== 6} onClick={() => void mfaAction("confirm")}>Confirm</Button>
              </div>
            </div>
          )}
          {recoveryCodes.length > 0 && (
            <Alert tone="warn" role="status" title="Save these one-time recovery codes. You will be signed out after enrollment.">
              <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {recoveryCodes.map((value) => <li key={value}><code className="block rounded-control border border-line-strong bg-surface px-2.5 py-1.5 text-center font-mono text-xs text-ink">{value}</code></li>)}
              </ul>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <CopyButton value={recoveryCodes.join("\n")} label="Copy codes" />
                <Link href="/login" className={buttonVariants({ variant: "default", size: "sm" })}><LogIn aria-hidden size={14} />Return to sign in</Link>
              </div>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active sessions</CardTitle>
          <CardDescription>Devices currently signed in to your account. Revoke any you do not recognise.</CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <EmptyState icon={MonitorSmartphone} hue="rose" title="No active sessions" description="Signed-in devices appear here." className="border-0 bg-transparent py-8" />
          ) : (
            <ul className="space-y-2">
              {sessions.map((session) => {
                const mobile = /mobile|android|iphone|ipad/i.test(session.userAgent ?? "");
                const DeviceIcon = mobile ? Smartphone : Laptop;
                return (
                  <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line px-3.5 py-3 text-sm">
                    <div className="flex min-w-0 items-start gap-3">
                      <IconTile icon={DeviceIcon} hue="slate" size="sm" />
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                          {session.authMethod}
                          {session.current && <StatusBadge tone="info">Current</StatusBadge>}
                          {session.mfaVerified && <StatusBadge tone="ok">MFA</StatusBadge>}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-soft">{session.ipAddress ?? "IP unavailable"} · {new Date(session.lastSeenAt).toLocaleString()}</p>
                        <p className="mt-0.5 max-w-xl truncate text-xs text-ink-dim">{session.userAgent ?? "User agent unavailable"}</p>
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="sm" className={DANGER_GHOST} loading={pendingAction === `revoke:${session.id}`} disabled={Boolean(pendingAction)} onClick={() => void revoke(session.id)}>Revoke</Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      {confirmDialog}
    </div>
  );
}

const DANGER_GHOST = "hover:!bg-danger-bg hover:!text-danger-fg";

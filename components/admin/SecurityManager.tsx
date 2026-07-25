"use client";

import { useEffect, useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import Link from "next/link";
import { useRouter } from "next/navigation";

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

  async function refresh() {
    const [mfaResponse, sessionResponse] = await Promise.all([
      fetch("/api/auth/mfa"),
      fetch("/api/auth/sessions"),
    ]);
    if (mfaResponse.ok) setMfa(await mfaResponse.json());
    if (sessionResponse.ok) setSessions((await sessionResponse.json()).sessions ?? []);
  }

  useEffect(() => {
    void Promise.all([fetch("/api/auth/mfa"), fetch("/api/auth/sessions")])
      .then(async ([mfaResponse, sessionResponse]) => {
        if (mfaResponse.ok) setMfa(await mfaResponse.json());
        if (sessionResponse.ok) setSessions((await sessionResponse.json()).sessions ?? []);
      });
  }, []);

  async function mfaAction(action: "start" | "confirm") {
    setError(null);
    const response = await fetch("/api/auth/mfa", {
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
  }

  async function revoke(id: string) {
    if (!window.confirm("Revoke this session immediately?")) return;
    const response = await fetch(`/api/auth/sessions?id=${id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error?.message ?? "Session revocation failed");
      return;
    }
    if (sessions.find((session) => session.id === id)?.current) router.replace("/admin/login");
    else await refresh();
  }

  return (
    <div className="space-y-6">
      <section className={`border bg-[var(--surface)] p-5 ${enrollmentRequired ? "border-[var(--amber)]" : "border-[var(--line)]"}`}>
        <h2 className="font-mono text-sm font-semibold">Authenticator MFA</h2>
        <p className="mt-1 text-xs text-[var(--fg-dim)]">
          {mfa?.enrolled ? `Enabled · ${mfa.recoveryCodesRemaining} recovery codes remain` : enrollmentRequired ? "Enrollment is required before administrative changes are allowed." : "Protect password sign-in with a time-based one-time code."}
        </p>
        {!mfa?.enrolled && !secret && (
          <button onClick={() => void mfaAction("start")} className="mt-3 bg-[var(--cyan)] px-3 py-2 text-xs font-semibold text-[var(--on-cyan)]">Start enrollment</button>
        )}
        {secret && (
          <div className="mt-3 space-y-3">
            <div className="border border-[var(--line)] bg-[var(--bg)] p-3 text-xs">
              <p>Add this key or URI to your authenticator application:</p>
              <code className="mt-2 block break-all">{secret}</code>
              <CopyButton value={uri ?? secret} label="Copy setup URI" className="mt-2 font-semibold text-[var(--cyan)]" />
            </div>
            <div className="flex gap-2">
              <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
              <button disabled={code.length !== 6} onClick={() => void mfaAction("confirm")} className="bg-[var(--cyan)] px-3 py-2 text-xs font-semibold text-[var(--on-cyan)] disabled:opacity-50">Confirm</button>
            </div>
          </div>
        )}
        {recoveryCodes.length > 0 && (
          <div className="mt-3 border border-[var(--amber)]/40 bg-[var(--amber-soft)] p-3 text-xs">
            <p className="font-semibold">Save these one-time recovery codes. You will be signed out after enrollment.</p>
            <div className="mt-2 grid grid-cols-2 gap-1 font-mono">{recoveryCodes.map((value) => <code key={value}>{value}</code>)}</div>
            <Link href="/admin/login" className="mt-3 inline-block font-semibold text-[var(--cyan)]">Return to sign in</Link>
          </div>
        )}
      </section>
      <section className="border border-[var(--line)] bg-[var(--surface)] p-5">
        <h2 className="font-mono text-sm font-semibold">Active sessions</h2>
        <div className="mt-3 divide-y divide-[var(--line)] border border-[var(--line)]">
          {sessions.map((session) => (
            <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs">
              <div>
                <p className="font-semibold">{session.authMethod}{session.current ? " · Current" : ""}{session.mfaVerified ? " · MFA" : ""}</p>
                <p className="mt-1 text-[var(--fg-dim)]">{session.ipAddress ?? "IP unavailable"} · {new Date(session.lastSeenAt).toLocaleString()}</p>
                <p className="mt-1 max-w-xl truncate text-[10px] text-[var(--fg-dim)]">{session.userAgent ?? "User agent unavailable"}</p>
              </div>
              <button onClick={() => void revoke(session.id)} className="border border-[var(--red)]/40 px-2 py-1 font-semibold text-[var(--red)]">Revoke</button>
            </div>
          ))}
        </div>
      </section>
      {error && <p role="alert" className="text-sm text-[var(--red)]">{error}</p>}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { QuickLogin } from "@/components/landing/QuickLogin";

export default function PlatformLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [enrollmentSecret, setEnrollmentSecret] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [connections, setConnections] = useState<Array<{ name: string; startUrl: string }>>([]);

  useEffect(() => {
    fetch("/api/auth/connections?audience=platform")
      .then((response) => response.ok ? response.json() : { connections: [] })
      .then((body) => setConnections(body.connections ?? []))
      .catch(() => setConnections([]));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/platform-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          ...(useRecoveryCode ? { recoveryCode } : { code: code || undefined }),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 202 && body.mfa?.required) {
        setMfaRequired(true);
        setEnrollmentSecret(
          body.mfa.enrollmentRequired && typeof body.mfa.secret === "string"
            ? body.mfa.secret
            : null
        );
        return;
      }
      if (res.ok) {
        if (Array.isArray(body.recoveryCodes) && body.recoveryCodes.length > 0) {
          setRecoveryCodes(body.recoveryCodes);
          return;
        }
        router.push("/platform");
        router.refresh();
      } else {
        setError(
          typeof body.error === "string"
            ? body.error
            : body.error?.message ?? "Login failed"
        );
      }
    } catch {
      setError("Unable to reach the platform console. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grain relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--bg)] p-4 sm:p-6">
      <div aria-hidden className="absolute -left-24 -top-24 h-80 w-80 bg-[var(--cyan)]/15 blur-3xl" />
      <div aria-hidden className="absolute -bottom-32 -right-24 h-96 w-96 bg-[var(--cyan)]/10 blur-3xl" />

      <div className="relative w-full max-w-sm border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
        <Link href="/" className="flex items-center gap-2 font-mono text-sm font-semibold text-[var(--fg)]">
          SignalHub <span className="mt-1.5 inline-block h-1.5 w-1.5 bg-[var(--cyan)] pulse-dot" />
        </Link>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-[var(--fg-dim)]">Platform console</p>
        <h1 className="mt-4 font-mono text-2xl font-semibold text-[var(--fg)]">
          {recoveryCodes.length > 0 ? "Save recovery codes" : "Platform admin"}
        </h1>
        <p className="mt-1 text-sm text-[var(--fg-soft)]">
          {recoveryCodes.length > 0
            ? "These codes are shown once. Store them somewhere secure."
            : "Internal console — password and authenticator verification required."}
        </p>

        {recoveryCodes.length > 0 ? (
          <div className="mt-7 space-y-4">
            <div className="grid grid-cols-2 gap-2 border border-[var(--line)] bg-[var(--bg)] p-3 font-mono text-xs text-[var(--fg)]">
              {recoveryCodes.map((recovery) => (
                <code key={recovery}>{recovery}</code>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                router.push("/platform");
                router.refresh();
              }}
              className="w-full bg-[var(--cyan)] py-3 text-sm font-semibold text-[var(--on-cyan)]"
            >
              I saved these codes
            </button>
          </div>
        ) : (
        <form onSubmit={submit} className="mt-7 space-y-3">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="Email"
            className="w-full border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] outline-none transition-colors focus:border-[var(--cyan)]"
            required
            disabled={mfaRequired}
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Password"
            className="w-full border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] outline-none transition-colors focus:border-[var(--cyan)]"
            required
            disabled={mfaRequired}
          />
          {mfaRequired && enrollmentSecret && (
            <div className="border border-[var(--amber)]/40 bg-[var(--amber-soft)] p-3 text-xs text-[var(--fg-soft)]">
              <p className="font-semibold text-[var(--fg)]">Enroll an authenticator app</p>
              <p className="mt-1">Add this setup key, then enter the current six-digit code.</p>
              <code className="mt-2 block break-all border border-[var(--line)] bg-[var(--bg)] p-2 font-mono text-[var(--fg)]">
                {enrollmentSecret}
              </code>
            </div>
          )}
          {mfaRequired && !useRecoveryCode && (
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit authenticator code"
              className="w-full border border-[var(--line)] bg-[var(--bg)] px-4 py-3 font-mono text-sm tracking-widest text-[var(--fg)] placeholder:tracking-normal placeholder:text-[var(--fg-dim)] outline-none transition-colors focus:border-[var(--cyan)]"
              required
            />
          )}
          {mfaRequired && useRecoveryCode && (
            <input
              value={recoveryCode}
              onChange={(event) => setRecoveryCode(event.target.value)}
              autoComplete="one-time-code"
              placeholder="Recovery code"
              className="w-full border border-[var(--line)] bg-[var(--bg)] px-4 py-3 font-mono text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] outline-none transition-colors focus:border-[var(--cyan)]"
              required
            />
          )}
          {mfaRequired && !enrollmentSecret && (
            <button
              type="button"
              className="text-xs font-semibold text-[var(--cyan)]"
              onClick={() => {
                setUseRecoveryCode((value) => !value);
                setError(null);
              }}
            >
              {useRecoveryCode ? "Use authenticator code" : "Use a recovery code"}
            </button>
          )}
          {error && <p role="alert" className="text-xs text-[var(--red)]">{error}</p>}
          <button
            disabled={loading}
            className="w-full bg-[var(--cyan)] py-3 text-sm font-semibold text-[var(--on-cyan)] transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          >
            {loading ? "Verifying…" : mfaRequired ? "Verify and sign in" : "Continue"}
          </button>
        </form>
        )}
        {!mfaRequired && recoveryCodes.length === 0 && connections.map((connection) => (
          <Link
            key={connection.startUrl}
            href={connection.startUrl}
            prefetch={false}
            className="mt-3 block w-full border border-[var(--line-bright)] py-3 text-center text-sm font-semibold text-[var(--fg)] hover:bg-[var(--hover-overlay)]"
          >
            Sign in with {connection.name}
          </Link>
        ))}
        {!mfaRequired && recoveryCodes.length === 0 && <QuickLogin audience="platform" />}
      </div>
    </div>
  );
}

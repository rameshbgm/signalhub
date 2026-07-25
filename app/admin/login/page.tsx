"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { QuickLogin } from "@/components/landing/QuickLogin";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [connections, setConnections] = useState<Array<{ name: string; startUrl: string; type: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/connections")
      .then((response) => response.ok ? response.json() : { connections: [] })
      .then((body) => setConnections(body.connections ?? []))
      .catch(() => setConnections([]));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, ...(code ? { code } : {}) }),
      });
      if (res.status === 202) {
        setMfaRequired(true);
        setError(null);
        return;
      }
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        router.push(
          data.mustChangePassword
            ? "/admin/change-password"
            : data.mfaEnrollmentRequired
              ? "/admin/security"
              : "/admin"
        );
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error?.message ?? "Login failed");
      }
    } catch {
      setError("Unable to sign in. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-[var(--bg)] text-[var(--fg)] lg:grid-cols-2">
      {/* Brand panel */}
      <div className="grain relative hidden overflow-hidden bg-[var(--surface)] p-12 text-[var(--fg)] lg:flex lg:flex-col">
        <div aria-hidden className="absolute -left-24 -top-24 h-80 w-80 bg-[var(--cyan)]/25 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 -right-24 h-96 w-96 bg-[var(--cyan)]/15 blur-3xl" />
        <Link href="/" className="relative flex items-center gap-2 font-mono text-lg font-semibold">
          SignalHub <span className="mt-1.5 inline-block h-2 w-2 bg-[var(--cyan)] pulse-dot" />
        </Link>
        <div className="relative mt-auto">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--fg-dim)]">
            Product preview · illustrative data
          </p>
          <p className="font-mono text-4xl font-semibold leading-tight">
            Calm is a feature.
            <br />
            <em className="not-italic text-[var(--cyan)]">Ship it.</em>
          </p>
          <div className="mt-8 w-fit border border-[var(--input-overlay-border)] bg-[var(--panel-glass)] p-4 backdrop-blur">
            <div className="flex items-center gap-2 text-sm">
              <span className="h-2 w-2 bg-[var(--green)]" />
              All Systems Operational
            </div>
            <p className="mt-1.5 font-mono text-[10px] text-[var(--fg-dim)]">
              Example service overview · uptime, incidents, and delivery
            </p>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center gap-2 font-mono text-lg font-semibold lg:hidden">
            SignalHub <span className="mt-1.5 inline-block h-2 w-2 bg-[var(--cyan)]" />
          </Link>
          <h1 className="font-mono text-3xl font-semibold tracking-tight text-[var(--fg)]">Welcome back</h1>
          <p className="mt-2 text-sm text-[var(--fg-soft)]">Sign in to your incident console.</p>

          <form onSubmit={submit} className="mt-8 space-y-3">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="Email"
              className="w-full border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] outline-none transition-colors focus:border-[var(--cyan)]"
              required
            />
            {mfaRequired && (
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit authenticator code"
                className="w-full border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] outline-none transition-colors focus:border-[var(--cyan)]"
                required
              />
            )}
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Password"
              className="w-full border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] outline-none transition-colors focus:border-[var(--cyan)]"
              required
            />
            {error && <p className="text-xs text-[var(--red)]">{error}</p>}
            <button
              disabled={loading}
              className="w-full bg-[var(--cyan)] py-3 text-sm font-semibold text-[var(--on-cyan)] transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {process.env.NEXT_PUBLIC_OIDC_ENABLED === "true" && (
            <Link
              href="/api/auth/oidc/start"
              prefetch={false}
              className="mt-3 block w-full border border-[var(--line-bright)] py-3 text-center text-sm font-semibold text-[var(--fg)] hover:bg-[var(--hover-overlay)]"
            >
              Sign in with OpenID Connect
            </Link>
          )}
          {connections.map((connection) => (
            <Link
              key={connection.startUrl}
              href={connection.startUrl}
              prefetch={false}
              className="mt-3 block w-full border border-[var(--line-bright)] py-3 text-center text-sm font-semibold text-[var(--fg)] hover:bg-[var(--hover-overlay)]"
            >
              Sign in with {connection.name}
            </Link>
          ))}

          <QuickLogin audience="tenant" />

          <p className="mt-5 border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-xs leading-relaxed text-[var(--fg-dim)]">
            Use the credentials supplied by your organization administrator. This instance does not include shared demo accounts.
          </p>

          <p className="mt-8 text-center text-sm text-[var(--fg-soft)]">
            New here?{" "}
            <Link href="/signup" className="font-semibold text-[var(--cyan)] underline-offset-4 hover:underline">
              Create an organization
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QuickLogin } from "@/components/landing/QuickLogin";

export function UnifiedLogin({ returnTo }: { returnTo: string | null }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [connections, setConnections] = useState<Array<{ name: string; startUrl: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchWithTimeout("/api/auth/connections")
      .then((response) => response.ok ? response.json() : { connections: [] })
      .then((body) => setConnections(body.connections ?? []))
      .catch(() => setConnections([]));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithTimeout("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password, ...(code ? { code } : {}) }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 202) {
        setMfaRequired(true);
        return;
      }
      if (!response.ok) {
        setError(typeof body.error === "string" ? body.error : body.error?.message ?? "Login failed");
        return;
      }
      const destination = body.mustChangePassword || body.mustCompleteProfile
        ? "/organization/change-password"
        : body.mfaEnrollmentRequired
          ? "/organization/security"
          : returnTo ?? "/organization";
      router.push(destination);
      router.refresh();
    } catch {
      setError("Unable to sign in. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-[var(--bg)] text-[var(--fg)] lg:grid-cols-[minmax(0,1.08fr)_minmax(430px,0.92fr)]">
      <aside className="grain relative hidden min-h-screen overflow-hidden border-r border-[var(--line)] bg-[var(--surface)] px-10 py-9 lg:flex lg:flex-col xl:px-14 xl:py-11">
        <div aria-hidden className="absolute -left-32 -top-28 h-96 w-96 rounded-full bg-[var(--cyan)]/14 blur-3xl" />
        <div aria-hidden className="absolute -bottom-36 -right-28 h-[28rem] w-[28rem] rounded-full bg-[var(--cyan)]/10 blur-3xl" />

        <header className="relative flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-mono text-lg font-semibold">
            SignalHub <span className="mt-1 inline-block h-2 w-2 bg-[var(--cyan)] pulse-dot" />
          </Link>
          <span className="border border-[var(--line-bright)] bg-[var(--bg)]/70 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--fg-dim)]">
            Enterprise status operations
          </span>
        </header>

        <div className="relative my-auto w-full max-w-2xl py-8">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--cyan)]">One identity · one console</p>
          <h2 className="mt-4 max-w-xl font-mono text-[clamp(2.25rem,4vw,4rem)] font-semibold leading-[1.04] tracking-[-0.04em]">
            Run every status operation from one place.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-[var(--fg-soft)]">
            Publish trusted updates, coordinate incident response, and govern every organization with a unified enterprise control plane.
          </p>

          <div className="mt-8 grid max-w-2xl grid-cols-2 gap-3">
            {[
              ["01", "Status experiences", "Custom pages, components, groups, themes, and live previews."],
              ["02", "Incident operations", "Incidents, maintenance, monitors, metrics, and response workflows."],
              ["03", "Audience delivery", "Email, SMS, chat, webhooks, on-call destinations, and feeds."],
              ["04", "Identity & governance", "Role-based access, SSO, SCIM, audit trails, and platform controls."],
            ].map(([number, title, description]) => (
              <div key={number} className="border border-[var(--line)] bg-[var(--bg)]/75 p-4 backdrop-blur-sm">
                <div className="flex items-start gap-3">
                  <span className="font-mono text-[10px] font-semibold tracking-wider text-[var(--cyan)]">{number}</span>
                  <div>
                    <h3 className="text-sm font-semibold">{title}</h3>
                    <p className="mt-1.5 text-xs leading-5 text-[var(--fg-soft)]">{description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <footer className="relative flex items-center justify-between border-t border-[var(--line)] pt-5 text-xs text-[var(--fg-dim)]">
          <span>Self-hosted and enterprise ready</span>
          <span className="font-mono uppercase tracking-[0.14em]">Secure · Observable · Customizable</span>
        </footer>
      </aside>

      <main className="flex items-center justify-center p-4 sm:p-6 lg:py-8">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-7 flex items-center gap-2 font-mono text-lg font-semibold lg:hidden">SignalHub <span className="mt-1.5 inline-block h-2 w-2 bg-[var(--cyan)]" /></Link>
          <h1 className="font-mono text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-sm text-[var(--fg-soft)]">Sign in to the SignalHub console with your User ID.</p>

          <form onSubmit={submit} className="mt-7 space-y-3">
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="User ID" disabled={mfaRequired} required className="w-full border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm outline-none focus:border-[var(--cyan)] disabled:opacity-60" />
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" placeholder="Password" disabled={mfaRequired} required className="w-full border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm outline-none focus:border-[var(--cyan)] disabled:opacity-60" />
            {mfaRequired && <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit authenticator code" required className="w-full border border-[var(--line)] bg-[var(--bg)] px-4 py-3 font-mono text-sm tracking-widest outline-none focus:border-[var(--cyan)]" />}
            {error && <p role="alert" className="text-xs text-[var(--red)]">{error}</p>}
            <button disabled={loading} className="w-full bg-[var(--cyan)] py-3 text-sm font-semibold text-[var(--on-cyan)] disabled:opacity-50">{loading ? "Signing in…" : mfaRequired ? "Verify and sign in" : "Sign in"}</button>
          </form>

          {process.env.NEXT_PUBLIC_OIDC_ENABLED === "true" && <Link href="/api/auth/oidc/start" prefetch={false} className="mt-3 block w-full border border-[var(--line-bright)] py-3 text-center text-sm font-semibold hover:bg-[var(--hover-overlay)]">Sign in with OpenID Connect</Link>}
          {connections.map((connection) => <Link key={connection.startUrl} href={connection.startUrl} prefetch={false} className="mt-3 block w-full border border-[var(--line-bright)] py-3 text-center text-sm font-semibold hover:bg-[var(--hover-overlay)]">Sign in with {connection.name}</Link>)}
          <QuickLogin />
        </div>
      </main>
    </div>
  );
}

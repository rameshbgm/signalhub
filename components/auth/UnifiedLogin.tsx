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
    <div className="dispatch-access min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <header className="flex min-h-16 items-center justify-between border-b border-[var(--line)] bg-[var(--surface)] px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2 font-mono text-base font-semibold tracking-tight">
          <span className="inline-block h-2.5 w-2.5 bg-[var(--cyan)] pulse-dot" /> SignalHub
        </Link>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--fg-dim)]">Operator access</span>
      </header>

      <main className="mx-auto grid w-full max-w-[76rem] gap-px border-x border-[var(--line)] bg-[var(--line)] lg:grid-cols-[minmax(0,1.2fr)_minmax(23rem,0.8fr)]">
        <section className="relative min-h-[21rem] overflow-hidden bg-[var(--surface)] px-6 py-12 sm:px-10 lg:min-h-[calc(100vh-4rem)] lg:px-14 lg:py-16">
          <div aria-hidden className="absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(215,239,75,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(215,239,75,0.04)_1px,transparent_1px)] [background-size:42px_42px]" />
          <div className="relative max-w-xl">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--cyan)]">Control horizon</p>
            <h1 className="mt-5 font-mono text-[clamp(2.7rem,6vw,5.6rem)] font-semibold leading-[0.9] tracking-[-0.065em]">Enter the operations deck.</h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-[var(--fg-soft)]">
              Your organization’s status pages, response work, and delivery controls are ready on one shared horizon.
            </p>
            <div className="mt-10 grid max-w-2xl grid-cols-2 border border-[var(--line)] bg-[var(--bg)]/45 text-xs sm:grid-cols-4">
              {[
                ["01", "Pages"], ["02", "Response"], ["03", "Delivery"], ["04", "Governance"],
              ].map(([number, label]) => (
                <div key={number} className="border-r border-[var(--line)] px-3 py-4 last:border-r-0 sm:px-4">
                  <span className="block font-mono text-[10px] text-[var(--cyan)]">{number}</span>
                  <span className="mt-1 block font-semibold text-[var(--fg-soft)]">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="flex items-center bg-[var(--bg)] p-5 sm:p-8 lg:p-10">
          <div className="w-full max-w-md">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--fg-dim)]">Identity checkpoint</p>
          <h2 className="mt-3 font-mono text-3xl font-semibold tracking-[-0.045em]">Sign in</h2>
          <p className="mt-2 text-sm text-[var(--fg-soft)]">Use your SignalHub User ID to continue.</p>

          <form onSubmit={submit} className="mt-7 space-y-3">
            <input suppressHydrationWarning value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="User ID" disabled={mfaRequired} required className="w-full border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm outline-none focus:border-[var(--cyan)] disabled:opacity-60" />
            <input suppressHydrationWarning value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" placeholder="Password" disabled={mfaRequired} required className="w-full border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm outline-none focus:border-[var(--cyan)] disabled:opacity-60" />
            {mfaRequired && <input suppressHydrationWarning value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit authenticator code" required className="w-full border border-[var(--line)] bg-[var(--bg)] px-4 py-3 font-mono text-sm tracking-widest outline-none focus:border-[var(--cyan)]" />}
            {error && <p role="alert" className="text-xs text-[var(--red)]">{error}</p>}
            <button disabled={loading} className="w-full bg-[var(--cyan)] py-3 text-sm font-semibold text-[var(--on-cyan)] disabled:opacity-50">{loading ? "Signing in…" : mfaRequired ? "Verify and sign in" : "Sign in"}</button>
          </form>

          {process.env.NEXT_PUBLIC_OIDC_ENABLED === "true" && <Link href="/api/auth/oidc/start" prefetch={false} className="mt-3 block w-full border border-[var(--line-bright)] py-3 text-center text-sm font-semibold hover:bg-[var(--hover-overlay)]">Sign in with OpenID Connect</Link>}
          {connections.map((connection) => <Link key={connection.startUrl} href={connection.startUrl} prefetch={false} className="mt-3 block w-full border border-[var(--line-bright)] py-3 text-center text-sm font-semibold hover:bg-[var(--hover-overlay)]">Sign in with {connection.name}</Link>)}
          <QuickLogin />
          </div>
        </section>
      </main>
    </div>
  );
}

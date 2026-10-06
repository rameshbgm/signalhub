"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QuickLogin } from "@/components/landing/QuickLogin";
import { Button, buttonVariants } from "@/components/ui/button";
import { Activity } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <div className="min-h-screen bg-wash text-ink lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <main className="flex min-h-screen flex-col px-6 py-8 sm:px-12 lg:order-2 lg:min-h-0">
        <Link href="/" className="flex w-fit items-center gap-2.5 rounded-control text-base font-bold tracking-tight outline-none focus-visible:ring-4 focus-visible:ring-primary/25">
          <span aria-hidden="true" className="inline-grid size-9 place-items-center rounded-[0.5rem] bg-prism text-white shadow-primary">
            <Activity size={18} strokeWidth={2.25} />
          </span>
          SignalHub
        </Link>

        <div className="m-auto w-full max-w-sm animate-rise py-12">
          <h1 className="text-3xl font-bold tracking-[-0.025em]">Sign in</h1>
          <p className="mt-2 text-sm leading-6 text-ink-soft">Use your SignalHub User ID to continue.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="login-username">User ID</Label>
              <Input id="login-username" suppressHydrationWarning value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="User ID" disabled={mfaRequired} required className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password">Password</Label>
              <Input id="login-password" suppressHydrationWarning value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" placeholder="Password" disabled={mfaRequired} required className="h-10" />
            </div>
            {mfaRequired && (
              <div className="space-y-1.5">
                <Label htmlFor="login-code">Authenticator code</Label>
                <Input id="login-code" suppressHydrationWarning value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit authenticator code" required className="h-10" />
              </div>
            )}
            {error && <Alert tone="danger">{error}</Alert>}
            <Button type="submit" loading={loading} size="lg" className="w-full">{mfaRequired ? "Verify and sign in" : "Sign in"}</Button>
          </form>

          {(process.env.NEXT_PUBLIC_OIDC_ENABLED === "true" || connections.length > 0) && (
            <div className="mt-4 space-y-2">
              {process.env.NEXT_PUBLIC_OIDC_ENABLED === "true" && <Link href="/api/auth/oidc/start" prefetch={false} className={ssoLinkClass}>Sign in with OpenID Connect</Link>}
              {connections.map((connection) => <Link key={connection.startUrl} href={connection.startUrl} prefetch={false} className={ssoLinkClass}>Sign in with {connection.name}</Link>)}
            </div>
          )}
          <QuickLogin />
        </div>
      </main>

      <aside aria-hidden="true" className="relative m-3 hidden overflow-hidden rounded-card bg-prism lg:order-1 lg:block">
        <div className="absolute -right-24 -top-24 size-96 animate-float rounded-full bg-white/15 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 size-[28rem] animate-float rounded-full bg-amber-200/25 blur-3xl [animation-delay:-3s]" />
        <div className="relative flex h-full flex-col justify-center gap-10 px-14 py-16 xl:px-20">
          <div className="max-w-md text-white">
            <p className="text-4xl font-bold leading-[1.08] tracking-[-0.03em]">Know first.<br />Tell everyone.</p>
            <p className="mt-4 text-base leading-7 text-white/80">Status pages, incidents, and subscriber updates on infrastructure you own.</p>
          </div>
          <PreviewCard />
        </div>
      </aside>
    </div>
  );
}

const ssoLinkClass = buttonVariants({ variant: "secondary", size: "lg", className: "w-full" });

const PREVIEW_ROWS = [
  { name: "API", uptime: "99.99%", bars: 28 },
  { name: "Dashboard", uptime: "100%", bars: 28 },
  { name: "Notifications", uptime: "99.95%", bars: 28 },
];

/** A miniature public status page. The bars draw in once on load, then it stays still. */
function PreviewCard() {
  return (
    <div className="w-full max-w-md rounded-card bg-white/95 p-5 shadow-float">
      <div className="flex items-center gap-3 rounded-card bg-ok-bg px-4 py-3 text-ok-fg">
        <span className="size-2.5 rounded-full bg-ok animate-pulse-ring" />
        <span className="text-sm font-semibold">All systems operational</span>
      </div>
      <ul className="mt-4 space-y-4">
        {PREVIEW_ROWS.map((row, rowIndex) => (
          <li key={row.name}>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-semibold text-ink">{row.name}</span>
              <span className="tabular-nums text-ink-dim">{row.uptime}</span>
            </div>
            <div className="flex h-6 items-end gap-[3px]">
              {Array.from({ length: row.bars }, (_, index) => (
                <span
                  key={index}
                  style={{ animationDelay: `${300 + rowIndex * 140 + index * 16}ms` }}
                  className={`h-full flex-1 origin-bottom animate-bar-in rounded-[2px] ${rowIndex === 2 && index === 19 ? "bg-warn" : "bg-ok"}`}
                />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

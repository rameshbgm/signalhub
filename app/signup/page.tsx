"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const PERKS = ["Unlimited status pages", "Incident timelines and postmortems", "Verified email and signed webhooks", "Apache-2.0 self-hosted software"];

export default function SignupPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orgName, name, email, password }),
      });
      if (res.ok) {
        router.push("/admin");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error?.message ?? "Signup failed");
      }
    } catch {
      setError("Unable to create the organization. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-full border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] outline-none transition-colors focus:border-[var(--cyan)]";

  return (
    <div className="grid min-h-screen bg-[var(--bg)] text-[var(--fg)] lg:grid-cols-2">
      {/* Brand panel */}
      <div className="grain relative hidden overflow-hidden bg-[var(--surface)] p-12 text-[var(--fg)] lg:flex lg:flex-col">
        <div aria-hidden className="absolute -right-24 -top-24 h-80 w-80 bg-[var(--cyan)]/25 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 -left-24 h-96 w-96 bg-[var(--cyan)]/15 blur-3xl" />
        <Link href="/" className="relative flex items-center gap-2 font-mono text-lg font-semibold">
          SignalHub <span className="mt-1.5 inline-block h-2 w-2 bg-[var(--cyan)] pulse-dot" />
        </Link>
        <div className="relative mt-auto">
          <p className="font-mono text-4xl font-semibold leading-tight">
            Sixty seconds from now,
            <br />
            <em className="not-italic text-[var(--cyan)]">you have a status page.</em>
          </p>
          <ul className="mt-8 space-y-2.5">
            {PERKS.map((p) => (
              <li key={p} className="flex items-center gap-2.5 text-sm text-[var(--fg-soft)]">
                <span className="flex h-4 w-4 items-center justify-center bg-[var(--cyan-soft)] font-mono text-[9px] text-[var(--cyan)]">
                  ✓
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center gap-2 font-mono text-lg font-semibold lg:hidden">
            SignalHub <span className="mt-1.5 inline-block h-2 w-2 bg-[var(--cyan)]" />
          </Link>
          <h1 className="font-mono text-3xl font-semibold tracking-tight text-[var(--fg)]">Create your organization</h1>
          <p className="mt-2 text-sm text-[var(--fg-soft)]">Create a new organization on this SignalHub deployment.</p>

          <form onSubmit={submit} className="mt-8 space-y-3">
            <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Organization name" className={inputCls} required minLength={2} />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className={inputCls} required />
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Work email" className={inputCls} required />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Password (min 12 characters)"
              className={inputCls}
              required
              minLength={14}
            />
            {error && <p className="text-xs text-[var(--red)]">{error}</p>}
            <button
              disabled={loading}
              className="w-full bg-[var(--cyan)] py-3 text-sm font-semibold text-[var(--on-cyan)] transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              {loading ? "Creating…" : "Create organization"}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-[var(--fg-soft)]">
            Already have an account?{" "}
            <Link href="/admin/login" className="font-semibold text-[var(--cyan)] underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

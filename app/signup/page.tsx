"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const PERKS = ["Branded public status page", "Incident timeline & postmortems", "Email, SMS & webhook subscribers", "Free plan — no card required"];

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
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orgName, name, email, password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push("/admin");
      router.refresh();
    } else {
      setError((await res.json()).error ?? "Signup failed");
    }
  }

  const inputCls =
    "w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--ink)]";

  return (
    <div className="grid min-h-screen bg-[var(--paper)] text-[var(--ink)] lg:grid-cols-2">
      {/* Brand panel */}
      <div className="grain relative hidden overflow-hidden bg-[var(--ink)] p-12 text-white lg:flex lg:flex-col">
        <div aria-hidden className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[var(--up)]/25 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-[var(--up)]/15 blur-3xl" />
        <Link href="/" className="relative flex items-center gap-2 font-display text-lg font-semibold">
          statuspage <span className="mt-1.5 inline-block h-2 w-2 rounded-full bg-[var(--up)] pulse-dot" />
        </Link>
        <div className="relative mt-auto">
          <p className="font-display text-4xl font-medium leading-tight">
            Sixty seconds from now,
            <br />
            <em className="text-[#7fd7ab]">you have a status page.</em>
          </p>
          <ul className="mt-8 space-y-2.5">
            {PERKS.map((p) => (
              <li key={p} className="flex items-center gap-2.5 text-sm text-white/80">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--up)]/25 font-mono text-[9px] text-[#7fd7ab]">
                  ✓
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center gap-2 font-display text-lg font-semibold lg:hidden">
            statuspage <span className="mt-1.5 inline-block h-2 w-2 rounded-full bg-[var(--up)]" />
          </Link>
          <h1 className="font-display text-3xl font-medium tracking-tight">Create your organization</h1>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">Start on the free plan. Upgrade whenever.</p>

          <form onSubmit={submit} className="mt-8 space-y-3">
            <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Organization name" className={inputCls} required minLength={2} />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className={inputCls} required />
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Work email" className={inputCls} required />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Password (min 8 characters)"
              className={inputCls}
              required
              minLength={8}
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              disabled={loading}
              className="w-full rounded-full bg-[var(--ink)] py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              {loading ? "Creating…" : "Create organization"}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-[var(--ink-soft)]">
            Already have an account?{" "}
            <Link href="/admin/login" className="font-semibold text-[var(--ink)] underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

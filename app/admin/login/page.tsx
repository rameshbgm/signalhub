"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { QuickLogin } from "@/components/landing/QuickLogin";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push("/admin");
      router.refresh();
    } else {
      setError((await res.json()).error ?? "Login failed");
    }
  }

  return (
    <div className="grid min-h-screen bg-[var(--paper)] text-[var(--ink)] lg:grid-cols-2">
      {/* Brand panel */}
      <div className="grain relative hidden overflow-hidden bg-[var(--ink)] p-12 text-white lg:flex lg:flex-col">
        <div aria-hidden className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-[var(--up)]/25 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-[var(--up)]/15 blur-3xl" />
        <Link href="/" className="relative flex items-center gap-2 font-display text-lg font-semibold">
          statuspage <span className="mt-1.5 inline-block h-2 w-2 rounded-full bg-[var(--up)] pulse-dot" />
        </Link>
        <div className="relative mt-auto">
          <p className="font-display text-4xl font-medium leading-tight">
            Calm is a feature.
            <br />
            <em className="text-[#7fd7ab]">Ship it.</em>
          </p>
          <div className="mt-8 w-fit rounded-xl border border-white/15 bg-white/5 p-4 backdrop-blur">
            <div className="flex items-center gap-2 text-sm">
              <span className="h-2 w-2 rounded-full bg-[var(--up)]" />
              All Systems Operational
            </div>
            <p className="mt-1.5 font-mono text-[10px] text-white/50">99.98% uptime · 12,482 subscribers</p>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center gap-2 font-display text-lg font-semibold lg:hidden">
            statuspage <span className="mt-1.5 inline-block h-2 w-2 rounded-full bg-[var(--up)]" />
          </Link>
          <h1 className="font-display text-3xl font-medium tracking-tight">Welcome back</h1>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">Sign in to your incident console.</p>

          <form onSubmit={submit} className="mt-8 space-y-3">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="Email"
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--ink)]"
              required
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Password"
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--ink)]"
              required
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              disabled={loading}
              className="w-full rounded-full bg-[var(--ink)] py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="my-7 flex items-center gap-3 text-[10px] uppercase tracking-widest text-gray-300">
            <span className="h-px flex-1 bg-gray-200" /> or <span className="h-px flex-1 bg-gray-200" />
          </div>

          <QuickLogin />

          <p className="mt-8 text-center text-sm text-[var(--ink-soft)]">
            New here?{" "}
            <Link href="/signup" className="font-semibold text-[var(--ink)] underline-offset-4 hover:underline">
              Create an organization
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

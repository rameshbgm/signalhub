"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function PlatformLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/platform-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push("/platform/orgs");
      router.refresh();
    } else {
      setError((await res.json()).error ?? "Login failed");
    }
  }

  return (
    <div className="grain relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--ink)] p-6">
      <div aria-hidden className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-[var(--up)]/15 blur-3xl" />
      <div aria-hidden className="absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-[var(--up)]/10 blur-3xl" />

      <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur">
        <Link href="/" className="flex items-center gap-2 font-display text-sm font-semibold text-white">
          statuspage <span className="mt-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--up)] pulse-dot" />
        </Link>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-white/40">Platform console</p>
        <h1 className="mt-4 font-display text-2xl font-medium text-white">Platform admin</h1>
        <p className="mt-1 text-sm text-white/50">Internal console — spans all organizations.</p>

        <form onSubmit={submit} className="mt-7 space-y-3">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="Email"
            className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-white/40"
            required
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Password"
            className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-white/40"
            required
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            disabled={loading}
            className="w-full rounded-full bg-white py-3 text-sm font-semibold text-[var(--ink)] transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

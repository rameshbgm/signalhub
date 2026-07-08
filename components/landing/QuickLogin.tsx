"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DEMO_ACCOUNTS = [
  { label: "Acme", sub: "Platform demo · Enterprise", email: "admin@acme.test", password: "password123", hue: "bg-[var(--up)]" },
  { label: "Globex", sub: "Tenant demo · Pro", email: "hank@globex.test", password: "volcano123", hue: "bg-gray-900" },
];

export function QuickLogin() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function quick(email: string, password: string) {
    setBusy(email);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      router.push("/admin");
      router.refresh();
    } else {
      setBusy(null);
      setError("Demo account unavailable — run npm run db:seed");
    }
  }

  return (
    <div className="space-y-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray-400">One-click demo access</p>
      <div className="grid grid-cols-2 gap-2">
        {DEMO_ACCOUNTS.map((a) => (
          <button
            key={a.email}
            type="button"
            onClick={() => quick(a.email, a.password)}
            disabled={busy !== null}
            className="group flex items-center gap-2.5 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left transition-all hover:border-gray-900 hover:shadow-sm disabled:opacity-50"
          >
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${a.hue} font-mono text-[11px] font-semibold text-white`}>
              {a.label[0]}
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold leading-tight">{busy === a.email ? "Signing in…" : a.label}</span>
              <span className="block truncate text-[10px] text-gray-400">{a.sub}</span>
            </span>
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

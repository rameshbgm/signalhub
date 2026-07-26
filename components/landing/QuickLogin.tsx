"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type QuickAccount = {
  key: string;
  username: string;
  email: string;
  name: string;
  role: string;
  description: string;
};

export function QuickLogin() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<QuickAccount[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWithTimeout("/api/auth/dev-login", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { accounts: [] })
      .then((body) => {
        setAccounts(
          Array.isArray(body.accounts)
            ? body.accounts
            : []
        );
      })
      .catch(() => setAccounts([]));
  }, []);

  if (!accounts.length) return null;

  async function login(account: QuickAccount) {
    setBusy(account.key);
    setError(null);
    try {
      const response = await fetchWithTimeout("/api/auth/dev-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: account.key }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? "Quick login is unavailable");
        return;
      }
      router.push(body.redirectTo ?? "/organization");
      router.refresh();
    } catch {
      setError("Unable to reach the development login endpoint");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-5 border border-[var(--cyan)]/30 bg-[var(--surface)] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--cyan)]">
          Development quick login
        </p>
        <span className="text-[9px] uppercase tracking-wider text-[var(--fg-dim)]">Local only</span>
      </div>
      <div className="mt-2 grid gap-2">
        {accounts.map((account) => (
          <button
            key={account.key}
            type="button"
            onClick={() => login(account)}
            disabled={busy !== null}
            className="flex items-center justify-between gap-3 border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-left hover:border-[var(--cyan)] disabled:opacity-50"
          >
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-[var(--fg)]">
                {busy === account.key ? "Signing in…" : account.name}
              </span>
              <span className="block truncate text-[10px] text-[var(--fg-dim)]">
                {account.description}
              </span>
            </span>
            <span className="shrink-0 font-mono text-[10px] font-semibold text-[var(--cyan)]">
              {account.role.replaceAll("_", " ")}
            </span>
          </button>
        ))}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-[var(--red)]">{error}</p>}
    </section>
  );
}

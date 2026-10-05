"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

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
    <section className="mt-6 rounded-card border border-dashed border-primary/40 bg-primary-soft/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-primary-ink">Development quick login</p>
        <span className="rounded-full bg-surface px-2 py-0.5 text-2xs font-medium text-ink-soft ring-1 ring-line">Local only</span>
      </div>
      <div className="mt-3 grid gap-2">
        {accounts.map((account) => (
          <Button
            key={account.key}
            type="button"
            onClick={() => login(account)}
            disabled={busy !== null}
            variant="secondary"
            loading={busy === account.key}
            className="h-auto min-h-11 !justify-between py-2 text-left"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">
                {busy === account.key ? "Signing in…" : account.name}
              </span>
              <span className="block truncate text-xs font-normal text-ink-dim">
                {account.description}
              </span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-primary-ink">
              {account.role.replaceAll("_", " ").toLowerCase()}
            </span>
          </Button>
        ))}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-danger-fg">{error}</p>}
    </section>
  );
}

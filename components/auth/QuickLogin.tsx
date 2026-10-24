"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, ChevronDown, UserRound, Zap } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import styles from "@/components/auth/login.module.css";

type QuickAccount = {
  key: string;
  username: string;
  email: string;
  name: string;
  role: string;
  description: string;
  organizationName: string;
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  INCIDENT_MANAGER: "Incident manager",
  RESPONDER: "Responder",
  VIEWER: "Viewer",
};

export function QuickLogin() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<QuickAccount[]>([]);
  const [organization, setOrganization] = useState("");
  const [role, setRole] = useState("");
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

  const organizations = Array.from(new Set(accounts.map((account) => account.organizationName)));
  const selectedOrganization = organization || organizations[0];
  const organizationAccounts = accounts.filter((account) => account.organizationName === selectedOrganization);
  const selectedAccount = organizationAccounts.find((account) => account.role === role) ?? organizationAccounts[0];

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
    <section aria-labelledby="quick-login-heading" className={`${styles.quickLogin} border-t border-line`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="quick-login-heading" className="flex items-center gap-2 text-sm font-bold text-ink">
          <Zap aria-hidden="true" size={16} className="text-primary" />
          Quick login
        </h2>
        <span className="rounded-chip bg-primary-soft px-2 py-1 text-2xs font-medium text-primary-ink">Local development only</span>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); if (selectedAccount && busy === null) void login(selectedAccount); }} className={`${styles.quickForm} mt-3`}>
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="quick-login-org" className="flex items-center gap-1.5">
              <Building2 aria-hidden="true" size={14} className="text-ink-dim" /> Organization
            </Label>
            <div className="relative">
              <select id="quick-login-org" value={selectedOrganization} disabled={busy !== null}
                onChange={(event) => {
                  const next = event.target.value;
                  setOrganization(next);
                  setRole(accounts.find((account) => account.organizationName === next && account.role === selectedAccount?.role)?.role
                    ?? accounts.find((account) => account.organizationName === next)?.role ?? "");
                  setError(null);
                }}
                className={`${fieldClass} min-h-11 appearance-none py-2 pr-9`}
              >
                {organizations.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              <ChevronDown aria-hidden="true" size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-dim" />
            </div>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="quick-login-role" className="flex items-center gap-1.5">
              <UserRound aria-hidden="true" size={14} className="text-ink-dim" /> User type
            </Label>
            <div className="relative">
              <select id="quick-login-role" value={selectedAccount?.role ?? ""} disabled={busy !== null}
                aria-describedby="quick-login-description"
                onChange={(event) => { setRole(event.target.value); setError(null); }}
                className={`${fieldClass} min-h-11 appearance-none py-2 pr-9`}
              >
                {organizationAccounts.map((account) => (
                  <option key={account.key} value={account.role}>{ROLE_LABELS[account.role] ?? account.role.replaceAll("_", " ").toLowerCase()}</option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-dim" />
            </div>
          </div>
        </div>
        <div id="quick-login-description" aria-live="polite" aria-atomic="true" className="rounded-control bg-sunken px-3.5 py-2.5">
          <p className="text-sm leading-5 text-ink-soft">{selectedAccount?.description}</p>
          <p className="mt-1 text-xs leading-5 text-ink-dim">Signing in as <span className="font-medium text-ink-soft">{selectedAccount?.name}</span></p>
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" variant="secondary" size="lg" disabled={!selectedAccount || busy !== null} loading={busy !== null} className="w-full">
          {busy !== null ? "Signing in…" : "Quick login"}
          {busy === null && <ArrowRight aria-hidden="true" size={16} />}
        </Button>
      </form>
    </section>
  );
}

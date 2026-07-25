"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useRouter } from "next/navigation";
import { LogoutButton } from "@/components/admin/LogoutButton";

export function OrgSwitcher({
  orgName,
  orgId,
  organizations,
  pages,
  canConfigurePages,
}: {
  orgName: string;
  orgId: string;
  organizations: { id: string; name: string; slug: string; role: string }[];
  pages: { id: string; name: string; slug: string }[];
  canConfigurePages: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  async function switchOrganization(nextOrgId: string) {
    if (nextOrgId === orgId || switching) return;
    setSwitching(true);
    setSwitchError(null);

    try {
      const response = await fetch("/api/auth/switch-org", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orgId: nextOrgId }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setSwitchError(body.error?.message ?? "Organization could not be switched");
        return;
      }
      setOpen(false);
      router.push("/admin");
      router.refresh();
    } catch {
      setSwitchError("Unable to switch organizations. Check your connection and try again.");
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div ref={ref} className="relative flex items-center gap-2 border-b border-[var(--line)] px-3 py-3">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 transition-colors hover:bg-[var(--hover-overlay)]"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-[var(--cyan)] font-mono text-xs font-bold text-[var(--on-cyan)]">
          {orgName.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate font-mono text-sm font-semibold text-[var(--fg)]">{orgName}</span>
          <span className="block text-[11px] uppercase tracking-wide text-[var(--fg-dim)]">Self-hosted</span>
        </span>
        <span className={`text-[var(--fg-dim)] transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>
      <ThemeToggle />
      <LogoutButton compact className="lg:hidden" />

      {open && (
        <div role="menu" className="absolute left-3 right-3 top-full z-20 mt-1 border border-[var(--line-bright)] bg-[var(--surface-raised)] py-1.5 shadow-xl">
          {organizations.length > 1 && (
            <>
              <p className="px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--fg-dim)]">Organizations</p>
              {organizations.map((organization) => (
                <button
                  key={organization.id}
                  type="button"
                  role="menuitem"
                  disabled={switching || organization.id === orgId}
                  onClick={() => switchOrganization(organization.id)}
                  className="block w-full px-3 py-1.5 text-left text-sm text-[var(--fg)] hover:bg-[var(--hover-overlay)] disabled:opacity-60"
                >
                  {organization.name} <span className="text-[10px] uppercase text-[var(--fg-dim)]">{organization.role}</span>
                </button>
              ))}
              <div className="my-1 border-t border-[var(--line)]" />
            </>
          )}
          {switchError && (
            <p role="alert" className="px-3 py-1.5 text-xs text-[var(--red)]">
              {switchError}
            </p>
          )}
          <p className="px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--fg-dim)]">Your pages</p>
          {canConfigurePages &&
            pages.map((p) => (
              <Link
                key={p.id}
                href={`/admin/pages/${p.id}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--fg)] hover:bg-[var(--hover-overlay)]"
              >
                {p.name}
              </Link>
            ))}
          {!canConfigurePages && pages.length > 0 && (
            <p className="px-3 py-1.5 text-xs text-[var(--fg-dim)]">
              Open the Pages screen to inspect public views.
            </p>
          )}
          {pages.length === 0 && <p className="px-3 py-1.5 text-xs text-[var(--fg-dim)]">No pages yet</p>}
          <div className="mt-1 border-t border-[var(--line)] pt-1">
            <Link
              href="/admin/pages"
              onClick={() => setOpen(false)}
              className="block px-3 py-1.5 text-sm font-semibold text-[var(--cyan)] hover:bg-[var(--hover-overlay)]"
            >
              {canConfigurePages ? "Manage all pages →" : "View all pages →"}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

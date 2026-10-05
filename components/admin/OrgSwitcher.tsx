"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronsUpDown } from "lucide-react";

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
      const response = await fetchWithTimeout("/api/auth/switch-org", {
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
      router.push("/organization");
      router.refresh();
    } catch {
      setSwitchError("Unable to switch organizations. Check your connection and try again.");
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div ref={ref} className="relative border-b border-line p-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex w-full min-w-0 items-center gap-3 rounded-control px-2 py-2 text-left outline-none transition-colors duration-150 hover:bg-surface focus-visible:ring-4 focus-visible:ring-primary/25"
      >
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-control bg-gradient-to-br from-emerald-400 to-teal-600 text-sm font-semibold text-white shadow-card">
          {orgName.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{orgName}</span>
          <span className="block text-xs text-ink-dim">Self-hosted</span>
        </span>
        <ChevronsUpDown aria-hidden size={16} className="shrink-0 text-ink-dim" />
      </button>

      {open && (
        <div role="menu" className="absolute inset-x-3 top-full z-40 mt-1 animate-drop rounded-card border border-line bg-surface p-1.5 shadow-float">
          {organizations.length > 1 && (
            <>
              <p className="px-2.5 py-1 text-xs font-semibold text-ink-dim">Organizations</p>
              {organizations.map((organization) => (
                <button
                  key={organization.id}
                  type="button"
                  role="menuitem"
                  disabled={switching || organization.id === orgId}
                  onClick={() => switchOrganization(organization.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-control px-2.5 py-2 text-left text-sm text-ink outline-none transition-colors hover:bg-sunken focus-visible:bg-sunken disabled:opacity-60"
                >
                  <span className="min-w-0 truncate">{organization.name}</span>
                  <span className="shrink-0 text-xs text-ink-dim">{organization.role.toLowerCase()}</span>
                </button>
              ))}
              <div className="my-1 h-px bg-line" />
            </>
          )}
          {switchError && (
            <p role="alert" className="px-2.5 py-1.5 text-xs text-danger-fg">
              {switchError}
            </p>
          )}
          <p className="px-2.5 py-1 text-xs font-semibold text-ink-dim">Your pages</p>
          {canConfigurePages &&
            pages.map((p) => (
              <Link
                key={p.id}
                href={`/organization/pages/${p.id}`}
                onClick={() => setOpen(false)}
                className="block truncate rounded-control px-2.5 py-2 text-sm text-ink outline-none transition-colors hover:bg-sunken focus-visible:bg-sunken"
              >
                {p.name}
              </Link>
            ))}
          {!canConfigurePages && pages.length > 0 && (
            <p className="px-2.5 py-1.5 text-xs text-ink-dim">
              Open the Pages screen to inspect public views.
            </p>
          )}
          {pages.length === 0 && <p className="px-2.5 py-1.5 text-xs text-ink-dim">No pages yet.</p>}
          <div className="mt-1 border-t border-line pt-1">
            <Link
              href="/organization/pages"
              onClick={() => setOpen(false)}
              className="block rounded-control px-2.5 py-2 text-sm font-semibold text-primary-ink outline-none transition-colors hover:bg-primary-soft focus-visible:bg-primary-soft"
            >
              {canConfigurePages ? "Manage all pages" : "View all pages"}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

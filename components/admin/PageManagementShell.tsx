"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

type ManagedPage = {
  id: string;
  name: string;
  slug: string;
  isHub: boolean;
  type: string;
  setupCompleted: boolean;
  publicVisible: boolean;
  publicPath: string;
  parentHub: { id: string; name: string } | null;
};

const sections = [
  { key: "overview", label: "Overview", suffix: "" },
  { key: "content", label: "Content", suffix: "/content" },
  { key: "appearance", label: "Appearance", suffix: "/appearance" },
  { key: "access", label: "Access", suffix: "/access" },
  { key: "notifications", label: "Notifications", suffix: "/notifications" },
  { key: "settings", label: "Settings", suffix: "/settings" },
] as const;

export function PageManagementShell({ page, children }: { page: ManagedPage; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/organization/pages/${page.id}`;

  if (pathname === `${base}/design` || pathname.startsWith(`${base}/setup/`)) return children;

  const current = sections.find((section) => pathname === `${base}${section.suffix}`) ?? sections[0];
  const state = !page.setupCompleted ? "Draft" : page.publicVisible ? "Published" : "Hidden";

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <header className="border-b border-[var(--line)] pb-5">
        <Link href="/organization/pages" className="text-xs font-semibold text-[var(--cyan)] hover:underline">← All pages</Link>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-[var(--cyan-soft)] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--cyan)]">{page.isHub ? "Hub" : "Status page"}</span>
              <span className={`px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${page.publicVisible && page.setupCompleted ? "bg-[var(--green-soft)] text-[var(--green)]" : "bg-[var(--amber-soft)] text-[var(--amber)]"}`}>{state}</span>
              <span className="font-mono text-xs text-[var(--fg-dim)]">/{page.slug}</span>
            </div>
            <h1 className="mt-2 truncate font-mono text-2xl font-semibold text-[var(--fg)]">{page.name}</h1>
            {page.parentHub && (
              <p className="mt-1 text-sm text-[var(--fg-dim)]">In hub <Link href={`/organization/pages/${page.parentHub.id}/content`} className="font-semibold text-[var(--cyan)] hover:underline">{page.parentHub.name}</Link></p>
            )}
          </div>
          {page.setupCompleted && page.publicVisible && (
            <a href={page.publicPath} target="_blank" rel="noreferrer" className="shrink-0 border border-[var(--cyan)]/30 px-3 py-2 text-sm font-semibold text-[var(--cyan)] hover:bg-[var(--cyan-soft)]">View public page ↗</a>
          )}
        </div>
      </header>

      <label className="grid gap-1.5 text-xs font-semibold text-[var(--fg-soft)] lg:hidden">
        Page section
        <select
          value={`${base}${current.suffix}`}
          onChange={(event) => router.push(event.target.value)}
          className="border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--fg)]"
        >
          {sections.map((section) => <option key={section.key} value={`${base}${section.suffix}`}>{section.label}</option>)}
        </select>
      </label>

      <div className="grid items-start gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="Page management" className="sticky top-5 hidden border border-[var(--line)] bg-[var(--surface)] p-2 lg:block">
          {sections.map((section) => {
            const href = `${base}${section.suffix}`;
            const active = current.key === section.key;
            return (
              <Link key={section.key} href={href} aria-current={active ? "page" : undefined} className={`relative block px-3 py-2.5 font-mono text-sm ${active ? "bg-[var(--cyan-soft)] font-semibold text-[var(--cyan)]" : "text-[var(--fg-soft)] hover:bg-[var(--hover-overlay)] hover:text-[var(--fg)]"}`}>
                {active && <span className="absolute bottom-1 left-0 top-1 w-0.5 bg-[var(--cyan)]" aria-hidden />}
                {section.label}
              </Link>
            );
          })}
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

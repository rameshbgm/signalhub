"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

type ManagedPage = { id: string; name: string; slug: string; isHub: boolean; type: string; setupCompleted: boolean; publicVisible: boolean; publicPath: string; parentHub: { id: string; name: string } | null; canPublish: boolean };
const sections = [{ key: "overview", label: "Overview", suffix: "" }, { key: "content", label: "Content", suffix: "/content" }, { key: "appearance", label: "Appearance", suffix: "/appearance" }, { key: "access", label: "Access", suffix: "/access" }, { key: "notifications", label: "Notifications", suffix: "/notifications" }, { key: "settings", label: "Settings", suffix: "/settings" }] as const;

export function PageManagementShell({ page, actions, children }: { page: ManagedPage; actions: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/organization/pages/${page.id}`;
  const visibleSections = page.type === "PUBLIC" ? sections.filter((section) => section.key !== "access") : sections;
  // Keep the Appearance editor inside the same page-management chrome as the
  // other sections. The advanced design route and onboarding screens remain
  // focused flows with their own full-page controls.
  if (pathname === `${base}/design` || pathname.startsWith(`${base}/setup/`)) return children;
  const current = visibleSections.find((section) => pathname === `${base}${section.suffix}`) ?? visibleSections[0];
  const state = !page.setupCompleted ? "Draft" : page.publicVisible ? "Published" : "Hidden";
  const sectionLabel = (key: typeof visibleSections[number]["key"], fallback: string) => key === "content" ? (page.isHub ? "Status pages" : "Services & groups") : fallback;
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="border-b border-[var(--line)] pb-6">
        <Link href="/organization/pages" className="inline-flex text-sm font-semibold text-[var(--cyan)] hover:underline">← All pages</Link>
        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[var(--cyan-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--cyan)]">{page.isHub ? "Hub" : "Status page"}</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${page.publicVisible && page.setupCompleted ? "bg-[var(--green-soft)] text-[var(--green)]" : "bg-[var(--amber-soft)] text-[var(--amber)]"}`}>{state}</span>
              <span className="text-sm text-[var(--fg-dim)]">/{page.slug}</span>
            </div>
            <h1 className="mt-3 truncate text-3xl font-semibold tracking-[-0.03em] text-[var(--fg)]">{page.name}</h1>
            {page.parentHub && <p className="mt-1.5 text-sm text-[var(--fg-dim)]">In hub <Link href={`/organization/pages/${page.parentHub.id}/content`} className="font-semibold text-[var(--cyan)] hover:underline">{page.parentHub.name}</Link></p>}
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <label className="grid gap-1.5 text-sm font-medium text-[var(--fg-soft)] md:hidden">
          Page section
          <select value={`${base}${current.suffix}`} onChange={(event) => router.push(event.target.value)} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--fg)]">
            {visibleSections.map((section) => <option key={section.key} value={`${base}${section.suffix}`}>{sectionLabel(section.key, section.label)}</option>)}
          </select>
        </label>

        <nav aria-label="Page management" className="hidden min-w-0 flex-1 border-b border-[var(--line)] md:block">
          <div className="hidden min-w-max items-center gap-1 overflow-x-auto pb-px md:flex">
            {visibleSections.map((section) => {
              const href = `${base}${section.suffix}`;
              const active = current.key === section.key;
              return (
                <Link
                  key={section.key}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${active ? "border-[var(--cyan)] text-[var(--cyan)]" : "border-transparent text-[var(--fg-soft)] hover:border-[var(--line-bright)] hover:text-[var(--fg)]"}`}
                >
                  {sectionLabel(section.key, section.label)}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Appearance owns its preview and design-publish controls. Its action
            mount keeps those controls in this shared row without duplicating
            the page visibility actions. */}
        {current.key === "appearance" ? <div id="page-management-actions" className="shrink-0" /> : actions}
      </div>

      <div className="min-w-0">{children}</div>
    </div>
  );
}

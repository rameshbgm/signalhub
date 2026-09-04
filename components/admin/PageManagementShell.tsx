"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Eye, EyeOff, Send } from "lucide-react";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { PlatformSubmitButton } from "@/components/platform/PlatformSubmitButton";
import { finishPageSetup, setPagePublicVisibility } from "@/app/admin/(protected)/pages/actions";

type ManagedPage = { id: string; name: string; slug: string; isHub: boolean; type: string; setupCompleted: boolean; publicVisible: boolean; publicPath: string; parentHub: { id: string; name: string } | null; canPublish: boolean };
const sections = [{ key: "overview", label: "Overview", suffix: "" }, { key: "content", label: "Content", suffix: "/content" }, { key: "appearance", label: "Appearance", suffix: "/appearance" }, { key: "access", label: "Access", suffix: "/access" }, { key: "notifications", label: "Notifications", suffix: "/notifications" }, { key: "settings", label: "Settings", suffix: "/settings" }] as const;

export function PageManagementShell({ page, children }: { page: ManagedPage; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/organization/pages/${page.id}`;
  const visibleSections = page.type === "PUBLIC" ? sections.filter((section) => section.key !== "access") : sections;
  if (pathname === `${base}/appearance` || pathname === `${base}/design` || pathname.startsWith(`${base}/setup/`)) return children;
  const current = visibleSections.find((section) => pathname === `${base}${section.suffix}`) ?? visibleSections[0];
  const state = !page.setupCompleted ? "Draft" : page.publicVisible ? "Published" : "Hidden";
  const sectionLabel = (key: typeof visibleSections[number]["key"], fallback: string) => key === "content" ? (page.isHub ? "Status pages" : "Services & groups") : fallback;
  const publishing = !page.setupCompleted || !page.publicVisible;
  const publishAction = !page.setupCompleted
    ? finishPageSetup.bind(null, page.id)
    : setPagePublicVisibility.bind(null, page.id, true);
  const visibilityAction = page.setupCompleted && page.publicVisible
    ? setPagePublicVisibility.bind(null, page.id, false)
    : publishAction;
  const actionLabel = page.setupCompleted && page.publicVisible ? "Hide page" : "Publish page";
  const actionMessage = page.setupCompleted && page.publicVisible ? "Page hidden" : "Page published";
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

        <div className="flex shrink-0 items-center gap-2 pb-2 md:pb-1">
          {page.setupCompleted && page.publicVisible && <a href={page.publicPath} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--line-bright)] bg-[var(--surface)] px-3.5 py-2 text-sm font-semibold text-[var(--cyan)] hover:bg-[var(--cyan-soft)]"><Eye aria-hidden="true" size={16} />Preview</a>}
          <PlatformActionForm action={visibilityAction} successMessage={actionMessage} className="relative flex" messageClassName="absolute right-0 top-full z-10 mt-2 whitespace-nowrap">
            <PlatformSubmitButton disabled={!page.setupCompleted && !page.canPublish} pendingLabel={publishing ? "Publishing…" : "Updating…"} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--cyan)] px-3.5 py-2 text-sm font-semibold text-[var(--on-cyan)]"><span aria-hidden="true">{page.setupCompleted && page.publicVisible ? <EyeOff size={16} /> : <Send size={16} />}</span>{actionLabel}</PlatformSubmitButton>
          </PlatformActionForm>
        </div>
      </div>

      <div className="min-w-0">{children}</div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, ArrowUpRight, Bell, Boxes, Layers3, LayoutDashboard, LayoutGrid, Palette, Settings, ShieldCheck, type LucideIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

type ManagedPage = { id: string; name: string; slug: string; isHub: boolean; type: string; setupCompleted: boolean; publicVisible: boolean; publicPath: string; parentHub: { id: string; name: string } | null; canPublish: boolean };
const sections: ReadonlyArray<{ key: "overview" | "content" | "appearance" | "access" | "notifications" | "settings"; label: string; suffix: string; icon: LucideIcon }> = [
  { key: "overview", label: "Overview", suffix: "", icon: LayoutDashboard },
  { key: "content", label: "Content", suffix: "/content", icon: Boxes },
  { key: "appearance", label: "Appearance", suffix: "/appearance", icon: Palette },
  { key: "access", label: "Access", suffix: "/access", icon: ShieldCheck },
  { key: "notifications", label: "Notifications", suffix: "/notifications", icon: Bell },
  { key: "settings", label: "Settings", suffix: "/settings", icon: Settings },
];

export function PageManagementShell({ page, actions, children }: { page: ManagedPage; actions: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const tabs = useRef<HTMLElement>(null);
  const base = `/organization/pages/${page.id}`;
  const visibleSections = page.type === "PUBLIC" ? sections.filter((section) => section.key !== "access") : sections;
  const current = visibleSections.find((section) => section.suffix && (pathname === `${base}${section.suffix}` || pathname.startsWith(`${base}${section.suffix}/`))) ?? visibleSections[0];

  // On narrow screens the tabs scroll sideways: keep the active one in view.
  useEffect(() => {
    const nav = tabs.current;
    const active = nav?.querySelector<HTMLElement>("[aria-current='page']");
    if (nav && active) nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
  }, [current.key]);

  // Keep the Appearance editor inside the same page-management chrome as the
  // other sections. The advanced design route and onboarding screens remain
  // focused flows with their own full-page controls.
  if (pathname === `${base}/design` || pathname.startsWith(`${base}/setup/`)) return children;

  const live = page.setupCompleted && page.publicVisible;
  const state = !page.setupCompleted ? "Draft" : page.publicVisible ? "Published" : "Hidden";
  const stateTone = !page.setupCompleted ? "warn" : page.publicVisible ? "ok" : "neutral";
  const sectionLabel = (key: typeof visibleSections[number]["key"], fallback: string) => key === "content" ? (page.isHub ? "Status pages" : "Services & groups") : fallback;
  const sectionIcon = (key: typeof visibleSections[number]["key"], fallback: LucideIcon) => key === "content" && page.isHub ? Layers3 : fallback;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href="/organization/pages" className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-3 max-sm:min-h-10" })}>
          <ArrowLeft aria-hidden size={16} />
          All pages
        </Link>
        <PageHeader
          title={page.name}
          icon={page.isHub ? Layers3 : LayoutGrid}
          hue="violet"
          description={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <StatusBadge tone={stateTone} live={live}>{state}</StatusBadge>
              <Badge>{page.isHub ? "Hub" : "Status page"}</Badge>
              <span className="font-mono text-xs text-ink-dim">/{page.slug}</span>
              {live && (
                <a href={page.publicPath} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-chip font-semibold text-primary-ink outline-none hover:underline focus-visible:ring-4 focus-visible:ring-primary/25">
                  View live page
                  <ArrowUpRight aria-hidden size={14} />
                </a>
              )}
              {page.parentHub && (
                <span>In hub <Link href={`/organization/pages/${page.parentHub.id}/content`} className="rounded-chip font-semibold text-primary-ink outline-none hover:underline focus-visible:ring-4 focus-visible:ring-primary/25">{page.parentHub.name}</Link></span>
              )}
            </span>
          }
          // Appearance owns its preview and design-publish controls. Its action
          // mount keeps those controls in this shared header without duplicating
          // the page visibility actions.
          actions={current.key === "appearance" ? <div id="page-management-actions" className="shrink-0" /> : actions}
        />
      </div>

      <nav ref={tabs} aria-label="Page management" className="w-full overflow-x-auto rounded-card bg-surface shadow-card ring-1 ring-line/80 p-1.5 [scrollbar-width:none] sm:w-fit sm:max-w-full [&::-webkit-scrollbar]:hidden">
        <ul className="flex min-w-max gap-1">
          {visibleSections.map((section) => {
            const href = `${base}${section.suffix}`;
            const active = current.key === section.key;
            const Icon = sectionIcon(section.key, section.icon);
            return (
              <li key={section.key}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-control px-3.5 text-sm outline-none transition-[background-color,color,box-shadow] duration-200 ease-soft focus-visible:ring-4 focus-visible:ring-primary/25",
                    active ? "bg-primary-soft font-semibold text-primary-ink ring-1 ring-inset ring-primary/20" : "font-medium text-ink-soft hover:bg-sunken hover:text-ink",
                  )}
                >
                  <Icon aria-hidden size={16} className={active ? "text-primary" : "text-ink-dim"} />
                  {sectionLabel(section.key, section.label)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="min-w-0">{children}</div>
    </div>
  );
}

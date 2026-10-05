"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, ChevronRight, PanelLeftClose, PanelLeftOpen, PanelsTopLeft, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTile } from "@/components/ui/icon-tile";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { activeNav, AdminNavList, visibleSections, type NavSection } from "@/components/admin/AdminNav";
import { CommandPalette, type PaletteEntry } from "@/components/admin/CommandPalette";
import { cn } from "@/lib/utils";
import type { Capability } from "@/lib/identity";

type ShellUser = { name: string; email: string };
type ShellPage = { id: string; name: string };

function BrandMark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("inline-grid size-10 place-items-center rounded-control bg-gradient-to-br from-primary to-accent text-white shadow-primary", className)}>
      <Activity size={20} strokeWidth={2.25} />
    </span>
  );
}

function UserCard({ user }: { user: ShellUser }) {
  return (
    <div className="space-y-2 border-t border-line p-3">
      <div className="flex min-w-0 items-center gap-2.5 px-1">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-primary text-sm font-semibold text-white">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
          <p className="truncate text-xs text-ink-dim">{user.email}</p>
        </div>
      </div>
      <LogoutButton />
    </div>
  );
}

export function AdminShell({
  capabilities,
  orgSwitcher,
  user,
  pages,
  children,
}: {
  capabilities: Capability[];
  orgSwitcher: ReactNode;
  user: ShellUser;
  pages: ShellPage[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const focusedFlow = pathname === "/organization/pages/new" || /^\/organization\/pages\/[^/]+\/setup\//.test(pathname);
  const sections = useMemo(() => visibleSections(capabilities), [capabilities]);
  const current = activeNav(sections, pathname);
  const activeSection: NavSection | undefined = current?.section ?? sections[0];

  const [panelOpen, setPanelOpen] = useState(true);
  const [sheet, setSheet] = useState<{ path: string; id: string } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const sheetSection = sheet && sheet.path === pathname ? sections.find((section) => section.id === sheet.id) : undefined;

  const entries = useMemo<PaletteEntry[]>(() => [
    ...sections.flatMap((section) => section.items.map((item) => ({ href: item.href, label: item.label, group: section.label, icon: item.icon, hue: item.hue }))),
    ...(capabilities.includes("page.configure") ? pages.map((page) => ({ href: `/organization/pages/${page.id}`, label: page.name, group: "Page", icon: PanelsTopLeft, hue: "violet" as const })) : []),
  ], [sections, pages, capabilities]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!sheetSection) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setSheet(null); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", onKey); };
  }, [sheetSection]);

  const skipLink = <a href="#main" className="sr-only z-[4000] rounded-control bg-surface px-3 py-2 text-sm font-semibold text-primary-ink shadow-float focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to content</a>;

  if (focusedFlow) {
    return (
      <div className="min-h-screen bg-wash text-ink">
        {skipLink}
        <div className="flex h-14 items-center px-4 sm:px-8">
          <Link href="/organization" className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
            <BrandMark className="size-8" /> SignalHub
          </Link>
        </div>
        <main id="main">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-wash text-ink lg:flex">
      {skipLink}

      {/* Icon rail */}
      <nav aria-label="Sections" className="sticky top-0 z-30 hidden h-screen w-[4.5rem] shrink-0 flex-col items-center gap-2 border-r border-line bg-surface/80 py-4 backdrop-blur lg:flex">
        <Link href="/organization" aria-label="SignalHub dashboard" className="mb-3 rounded-control outline-none focus-visible:ring-4 focus-visible:ring-primary/25">
          <BrandMark />
        </Link>
        {sections.map((section) => {
          const active = activeSection?.id === section.id;
          const Icon = section.icon;
          return (
            <Link
              key={section.id}
              href={section.items[0].href}
              aria-label={section.label}
              aria-current={active ? "true" : undefined}
              data-hue={section.hue}
              className="group relative grid size-11 place-items-center rounded-control outline-none focus-visible:ring-4 focus-visible:ring-primary/25"
            >
              <span aria-hidden="true" className={cn("absolute -left-[0.9rem] h-5 w-1 rounded-r-full bg-[var(--hue-fg)] transition-all duration-200 ease-soft", active ? "opacity-100" : "h-2 opacity-0")} />
              <span className={cn("grid size-10 place-items-center rounded-control bg-[var(--hue-bg)] text-[var(--hue-fg)] ring-1 ring-inset ring-black/5 transition-all duration-200 ease-spring", active ? "scale-100 shadow-raised" : "scale-90 opacity-70 group-hover:scale-100 group-hover:opacity-100")}>
                <Icon size={20} />
              </span>
              <span role="presentation" className="pointer-events-none absolute left-full z-50 ml-3 translate-x-[-4px] whitespace-nowrap rounded-control bg-ink px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-float transition-all duration-150 ease-soft group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100">
                {section.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Context panel */}
      {panelOpen && activeSection && (
        <aside aria-label={`${activeSection.label} panel`} className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-sunken/50 backdrop-blur lg:flex">
          {orgSwitcher}
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
            <p className="mb-2 px-2.5 text-xs font-semibold text-ink-dim">{activeSection.label}</p>
            <AdminNavList section={activeSection} pathname={pathname} />
          </div>
          <UserCard user={user} />
        </aside>
      )}

      <div className="min-w-0 flex-1">
        {/* Top strip */}
        <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line/70 bg-canvas/80 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="hidden lg:block">
            <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={panelOpen ? "Hide panel" : "Show panel"} aria-pressed={panelOpen} onClick={() => setPanelOpen((open) => !open)}>
              {panelOpen ? <PanelLeftClose aria-hidden size={18} /> : <PanelLeftOpen aria-hidden size={18} />}
            </Button>
          </div>
          <Link href="/organization" className="flex items-center gap-2 text-sm font-semibold tracking-tight lg:hidden">
            <BrandMark className="size-8" /> SignalHub
          </Link>
          <p className="hidden min-w-0 items-center gap-1.5 text-sm text-ink-soft lg:flex" aria-label="Current location">
            {current ? (
              <>
                <span>{current.section.label}</span>
                <ChevronRight aria-hidden size={14} className="shrink-0 text-ink-dim" />
                <span className="truncate font-semibold text-ink">{current.item.label}</span>
              </>
            ) : <span className="font-semibold text-ink">SignalHub</span>}
          </p>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Jump to a screen or page"
            className="ml-auto flex h-9 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-sm text-ink-dim shadow-card outline-none transition-[border-color,box-shadow] duration-200 hover:border-primary/40 focus-visible:ring-4 focus-visible:ring-primary/25 sm:w-64"
          >
            <Search aria-hidden size={15} />
            <span className="hidden flex-1 text-left sm:inline">Search or jump to…</span>
            <kbd className="hidden rounded-chip border border-line bg-sunken px-1.5 py-0.5 text-2xs font-medium text-ink-soft sm:inline">⌘K</kbd>
          </button>
        </div>

        <main id="main" className="mx-auto w-full max-w-[88rem] px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">
          <div key={pathname} className="animate-fade">{children}</div>
        </main>
      </div>

      {/* Mobile bottom bar */}
      <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="mx-auto flex max-w-xl items-stretch justify-around px-1">
          {sections.map((section) => {
            const active = activeSection?.id === section.id;
            const Icon = section.icon;
            return (
              <li key={section.id} className="min-w-0 flex-1" data-hue={section.hue}>
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-current={active ? "true" : undefined}
                  onClick={() => setSheet({ path: pathname, id: section.id })}
                  className="flex h-16 w-full flex-col items-center justify-center gap-1 rounded-control outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-primary/25"
                >
                  <span className={cn("grid h-7 w-10 place-items-center rounded-full transition-colors duration-200", active ? "bg-[var(--hue-bg)] text-[var(--hue-fg)]" : "text-ink-dim")}>
                    <Icon size={20} />
                  </span>
                  <span className={cn("max-w-full truncate text-2xs font-medium", active ? "text-ink" : "text-ink-dim")}>{section.tabLabel ?? section.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Mobile sheet */}
      {sheetSection && (
        <div className="fixed inset-0 z-40 flex animate-fade items-end bg-ink/40 backdrop-blur-sm lg:hidden" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSheet(null); }}>
          <div role="dialog" aria-modal="true" aria-label={`${sheetSection.label} menu`} className="max-h-[85vh] w-full animate-sheet overflow-y-auto rounded-t-sheet border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-float">
            <div className="flex items-center justify-between px-5 pb-1 pt-4">
              <div className="flex items-center gap-3">
                <IconTile icon={sheetSection.icon} hue={sheetSection.hue} />
                <h2 className="text-lg font-semibold tracking-tight">{sheetSection.label}</h2>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Close menu" onClick={() => setSheet(null)}><X aria-hidden size={18} /></Button>
            </div>
            <div className="mt-2 border-y border-line bg-sunken/50">{orgSwitcher}</div>
            <div className="px-3 py-3">
              <AdminNavList section={sheetSection} pathname={pathname} onNavigate={() => setSheet(null)} />
            </div>
            <UserCard user={user} />
          </div>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} entries={entries} />
    </div>
  );
}

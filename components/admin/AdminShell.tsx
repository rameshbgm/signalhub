"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, ChevronRight, Menu, PanelLeftClose, PanelLeftOpen, PanelsTopLeft, Search, Siren, Wrench, X } from "lucide-react";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { activeNav, isActivePath, visibleSections, type NavSection } from "@/components/admin/AdminNav";
import { CommandPalette, type PaletteEntry } from "@/components/admin/CommandPalette";
import { IconTile } from "@/components/ui/icon-tile";
import { cn } from "@/lib/utils";
import type { Capability } from "@/lib/identity";

type ShellUser = { name: string; email: string };
type ShellPage = { id: string; name: string };

function BrandMark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center text-primary", className)}>
      <Activity size={22} strokeWidth={2.5} />
    </span>
  );
}

function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link href="/organization" aria-label="SignalHub dashboard" className="flex min-w-0 items-center gap-2.5 rounded-control text-[0.9375rem] font-bold tracking-tight text-ink outline-none focus-visible:ring-[3px] focus-visible:ring-primary/30">
      <BrandMark />
      {!collapsed && <span className="truncate">SignalHub</span>}
    </Link>
  );
}

/** Grouped section links. `collapsed` shows icons only, with the label as a hover tip. */
function SidebarNav({ sections, pathname, collapsed = false, onNavigate }: { sections: NavSection[]; pathname: string; collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="space-y-5">
      {sections.map((section) => (
        <div key={section.id}>
          {collapsed
            ? <div aria-hidden="true" className="mx-auto mb-2 h-px w-6 bg-line first:hidden" />
            : <p className="mb-1.5 px-2.5 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-dim">{section.label}</p>}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    aria-label={collapsed ? item.label : undefined}
                    className={cn(
                      "group relative flex h-9 items-center gap-2.5 rounded-control px-2 text-sm outline-none transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-primary/30",
                      collapsed && "justify-center px-0",
                      active ? "bg-primary-soft font-semibold text-primary-ink" : "font-medium text-ink-soft hover:bg-sunken hover:text-ink",
                    )}
                  >
                    {active && <span aria-hidden="true" className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-primary" />}
                    <IconTile icon={item.icon} hue={item.hue} size="sm" className={cn("w-5 transition-opacity duration-150 [&_svg]:size-[17px]", !active && "opacity-80 group-hover:opacity-100")} />
                    {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                    {collapsed && (
                      <span role="presentation" className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-control bg-ink px-2 py-1 text-xs font-medium text-white opacity-0 shadow-raised transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
                        {item.label}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserFooter({ user, collapsed = false }: { user: ShellUser; collapsed?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5 border-t border-line p-3", collapsed && "flex-col")}>
      <span aria-hidden="true" title={collapsed ? `${user.name} · ${user.email}` : undefined} className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-xs font-bold text-white">
        {user.name.slice(0, 1).toUpperCase()}
      </span>
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
          <p className="truncate text-xs text-ink-dim">{user.email}</p>
        </div>
      )}
      <LogoutButton compact />
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

  const [collapsed, setCollapsed] = useState(false);
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const drawerOpen = drawerPath === pathname;
  const [paletteOpen, setPaletteOpen] = useState(false);

  const entries = useMemo<PaletteEntry[]>(() => [
    ...sections.flatMap((section) => section.items.map((item) => ({ href: item.href, label: item.label, group: section.label, icon: item.icon, hue: item.hue }))),
    ...(capabilities.includes("incident.manage") ? [
      { href: "/organization/incidents/new", label: "Report incident", group: "Action", icon: Siren, hue: "amber" as const },
      { href: "/organization/maintenance/new", label: "Schedule maintenance", group: "Action", icon: Wrench, hue: "amber" as const },
    ] : []),
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
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setDrawerPath(null); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", onKey); };
  }, [drawerOpen]);

  const skipLink = <a href="#main" className="sr-only z-[4000] rounded-control bg-surface px-3 py-2 text-sm font-semibold text-primary-ink shadow-raised focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to content</a>;

  if (focusedFlow) {
    return (
      <div className="min-h-screen bg-canvas text-ink">
        {skipLink}
        <div className="flex h-14 items-center border-b border-line bg-surface px-4 sm:px-6"><Brand /></div>
        <main id="main">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-ink lg:flex">
      {skipLink}

      {/* Sidebar */}
      <aside
        aria-label="Sidebar"
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 ease-soft lg:flex",
          collapsed ? "w-[4.25rem]" : "w-64",
        )}
      >
        <div className={cn("flex h-14 shrink-0 items-center border-b border-line px-4", collapsed && "justify-center px-0")}>
          <Brand collapsed={collapsed} />
        </div>
        {!collapsed && <div className="border-b border-line p-3">{orgSwitcher}</div>}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 [scrollbar-width:thin]">
          <SidebarNav sections={sections} pathname={pathname} collapsed={collapsed} />
        </div>
        <UserFooter user={user} collapsed={collapsed} />
      </aside>

      <div className="min-w-0 flex-1">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur-md sm:px-6">
          <button type="button" aria-label="Open menu" onClick={() => setDrawerPath(pathname)} className="grid size-9 place-items-center rounded-control text-ink-soft outline-none hover:bg-sunken focus-visible:ring-[3px] focus-visible:ring-primary/30 lg:hidden">
            <Menu aria-hidden size={18} />
          </button>
          <button type="button" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-pressed={collapsed} onClick={() => setCollapsed((value) => !value)} className="hidden size-8 place-items-center rounded-control text-ink-dim outline-none hover:bg-sunken hover:text-ink focus-visible:ring-[3px] focus-visible:ring-primary/30 lg:grid">
            {collapsed ? <PanelLeftOpen aria-hidden size={17} /> : <PanelLeftClose aria-hidden size={17} />}
          </button>
          <div className="lg:hidden"><Brand /></div>
          <p aria-label="Current location" className="hidden min-w-0 items-center gap-1.5 text-sm lg:flex">
            {current ? (
              <>
                <span className="text-ink-dim">{current.section.label}</span>
                <ChevronRight aria-hidden size={14} className="shrink-0 text-ink-dim/70" />
                <span className="truncate font-semibold text-ink">{current.item.label}</span>
              </>
            ) : <span className="font-semibold text-ink">SignalHub</span>}
          </p>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search or jump to a screen"
            className="ml-auto flex h-9 items-center gap-2 rounded-control border border-line bg-canvas px-2.5 text-sm text-ink-dim outline-none transition-colors duration-150 hover:border-line-strong hover:text-ink-soft focus-visible:ring-[3px] focus-visible:ring-primary/30 sm:w-72"
          >
            <Search aria-hidden size={15} />
            <span className="hidden flex-1 text-left sm:inline">Search…</span>
            <kbd className="hidden rounded-chip border border-line bg-surface px-1.5 font-mono text-2xs text-ink-soft sm:inline">⌘K</kbd>
          </button>
        </header>

        <main id="main" className="mx-auto w-full max-w-[84rem] px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          <div key={pathname} className="animate-rise">{children}</div>
        </main>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 animate-fade bg-ink/40 lg:hidden" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawerPath(null); }}>
          <div role="dialog" aria-modal="true" aria-label="Menu" className="flex h-full w-[min(18rem,86vw)] animate-[sh-drawer_220ms_var(--ease-soft)_both] flex-col border-r border-line bg-surface shadow-float">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
              <Brand />
              <button type="button" aria-label="Close menu" onClick={() => setDrawerPath(null)} className="grid size-9 place-items-center rounded-control text-ink-soft outline-none hover:bg-sunken focus-visible:ring-[3px] focus-visible:ring-primary/30"><X aria-hidden size={18} /></button>
            </div>
            <div className="border-b border-line p-3">{orgSwitcher}</div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
              <SidebarNav sections={sections} pathname={pathname} onNavigate={() => setDrawerPath(null)} />
            </div>
            <UserFooter user={user} />
          </div>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} entries={entries} />
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Activity, ChevronDown, PanelsTopLeft, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTile } from "@/components/ui/icon-tile";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { activeNav, AdminNavList, isActivePath, visibleSections, type NavSection } from "@/components/admin/AdminNav";
import { CommandPalette, type PaletteEntry } from "@/components/admin/CommandPalette";
import { cn } from "@/lib/utils";
import type { Capability } from "@/lib/identity";

type ShellUser = { name: string; email: string };
type ShellPage = { id: string; name: string };

function BrandMark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("inline-grid size-9 place-items-center rounded-[0.8rem] bg-prism text-white shadow-primary animate-gradient", className)}>
      <Activity size={18} strokeWidth={2.5} />
    </span>
  );
}

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-fuchsia-500 to-orange-400 text-sm font-bold text-white", className)}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Closes a popover on outside click or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) close(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, close]);
  return ref;
}

function UserMenu({ user }: { user: ShellUser }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="grid place-items-center rounded-full outline-none ring-2 ring-transparent transition-all duration-200 hover:ring-accent/30 focus-visible:ring-4 focus-visible:ring-primary/25"
      >
        <Avatar name={user.name} className="size-9" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 origin-top-right animate-drop rounded-card bg-surface p-2 shadow-float ring-1 ring-line">
          <div className="flex items-center gap-3 rounded-control bg-gradient-to-r from-primary-soft to-transparent p-3">
            <Avatar name={user.name} className="size-10" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{user.name}</p>
              <p className="truncate text-xs text-ink-dim">{user.email}</p>
            </div>
          </div>
          <div className="mt-1"><LogoutButton /></div>
        </div>
      )}
    </div>
  );
}

function SectionMenu({ section, active, pathname }: { section: NavSection; active: boolean; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const Icon = section.icon;
  const single = section.items.length === 1;
  const trigger = cn(
    "group relative flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-semibold outline-none transition-all duration-200 ease-soft focus-visible:ring-4 focus-visible:ring-primary/25",
    active ? "bg-ink text-white shadow-raised" : "text-ink-soft hover:bg-surface hover:text-ink hover:shadow-card",
  );
  const icon = <span data-hue={section.hue} className={cn("transition-transform duration-300 ease-spring group-hover:scale-125", active ? "text-[var(--hue-from)]" : "text-[var(--hue-to)]")}><Icon aria-hidden size={16} /></span>;

  if (single) {
    const item = section.items[0];
    return <Link href={item.href} aria-current={isActivePath(pathname, item.href) ? "page" : undefined} className={trigger}>{icon}{section.label}</Link>;
  }
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((value) => !value)} className={trigger}>
        {icon}
        {section.label}
        <ChevronDown aria-hidden size={14} className={cn("transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-72 origin-top-left animate-drop rounded-card bg-surface p-2 shadow-float ring-1 ring-line">
          <AdminNavList section={section} pathname={pathname} onNavigate={() => setOpen(false)} />
        </div>
      )}
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

  const skipLink = <a href="#main" className="sr-only z-[4000] rounded-full bg-surface px-4 py-2 text-sm font-semibold text-primary-ink shadow-float focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to content</a>;
  const brand = (
    <Link href="/organization" className="flex shrink-0 items-center gap-2.5 rounded-control text-[0.95rem] font-extrabold tracking-tight outline-none focus-visible:ring-4 focus-visible:ring-primary/25">
      <BrandMark /> <span>Signal<span className="text-prism">Hub</span></span>
    </Link>
  );

  if (focusedFlow) {
    return (
      <div className="min-h-screen bg-wash text-ink">
        {skipLink}
        <div className="flex h-16 items-center px-4 sm:px-8">{brand}</div>
        <main id="main" className="animate-rise">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-wash text-ink">
      {skipLink}

      {/* Top bar */}
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-5">
        <div className="glass mx-auto flex h-14 max-w-[92rem] items-center gap-3 rounded-full py-2 pl-3 pr-2 shadow-raised ring-1 ring-white/70 sm:pl-4">
          {brand}
          <nav aria-label="Sections" className="ml-2 hidden min-w-0 items-center gap-0.5 lg:flex">
            {sections.map((section) => (
              <SectionMenu key={section.id} section={section} active={activeSection?.id === section.id} pathname={pathname} />
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Jump to a screen or page"
              className="flex h-9 items-center gap-2 rounded-full bg-sunken px-3 text-sm text-ink-dim outline-none transition-all duration-200 hover:bg-primary-soft hover:text-primary-ink focus-visible:ring-4 focus-visible:ring-primary/25 2xl:w-56"
            >
              <Search aria-hidden size={15} />
              <span className="hidden flex-1 text-left 2xl:inline">Search…</span>
              <kbd className="hidden rounded-md bg-surface px-1.5 py-0.5 font-mono text-2xs font-semibold text-ink-soft shadow-card 2xl:inline">⌘K</kbd>
            </button>
            <div className="hidden max-w-52 sm:block">{orgSwitcher}</div>
            <UserMenu user={user} />
          </div>
        </div>
      </header>

      {/* In-section tabs */}
      {activeSection && activeSection.items.length > 1 && (
        <div className="mx-auto hidden max-w-[92rem] px-5 pt-5 lg:block lg:px-10">
          <nav aria-label={`${activeSection.label} screens`} className="flex flex-wrap gap-1.5">
            {activeSection.items.map((item) => {
              const active = isActivePath(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  data-hue={item.hue}
                  className={cn(
                    "group flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold outline-none transition-all duration-200 ease-soft focus-visible:ring-4 focus-visible:ring-primary/25",
                    active ? "bg-gradient-to-r from-[var(--hue-from)] to-[var(--hue-to)] text-white shadow-[0_6px_16px_-8px_var(--hue-to)]" : "bg-surface/70 text-ink-soft ring-1 ring-line hover:-translate-y-px hover:text-[var(--hue-fg)] hover:ring-[var(--hue-from)]",
                  )}
                >
                  <Icon aria-hidden size={14} className="transition-transform duration-300 ease-spring group-hover:scale-125" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}

      <main id="main" className="mx-auto w-full max-w-[92rem] px-4 pb-32 pt-6 sm:px-6 lg:px-10 lg:pb-14 lg:pt-7">
        <div key={pathname} className="animate-rise">{children}</div>
      </main>

      {/* Mobile dock */}
      <nav aria-label="Sections" className="fixed inset-x-3 bottom-3 z-30 pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="glass mx-auto flex max-w-xl items-stretch justify-around rounded-[1.75rem] p-1.5 shadow-float ring-1 ring-white/70">
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
                  className={cn("flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-[1.4rem] outline-none transition-all duration-200 focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-primary/25", active ? "bg-gradient-to-br from-[var(--hue-from)] to-[var(--hue-to)] text-white shadow-[0_8px_18px_-8px_var(--hue-to)]" : "text-ink-dim")}
                >
                  <Icon aria-hidden size={20} />
                  <span className="max-w-full truncate text-2xs font-semibold">{section.tabLabel ?? section.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Mobile sheet */}
      {sheetSection && (
        <div className="fixed inset-0 z-50 flex animate-fade items-end bg-ink/30 backdrop-blur-md lg:hidden" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSheet(null); }}>
          <div role="dialog" aria-modal="true" aria-label={`${sheetSection.label} menu`} className="max-h-[85vh] w-full animate-sheet overflow-y-auto rounded-t-sheet bg-surface pb-[env(safe-area-inset-bottom)] shadow-float">
            <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line-strong" />
            <div className="flex items-center justify-between px-5 pb-2 pt-3">
              <div className="flex items-center gap-3">
                <IconTile icon={sheetSection.icon} hue={sheetSection.hue} />
                <h2 className="text-lg font-extrabold tracking-tight">{sheetSection.label}</h2>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Close menu" onClick={() => setSheet(null)}><X aria-hidden size={18} /></Button>
            </div>
            <div className="px-4 pb-2 sm:hidden">{orgSwitcher}</div>
            <div className="px-3 py-3">
              <AdminNavList section={sheetSection} pathname={pathname} onNavigate={() => setSheet(null)} />
            </div>
            <div className="border-t border-line p-3"><LogoutButton /></div>
          </div>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} entries={entries} />
    </div>
  );
}

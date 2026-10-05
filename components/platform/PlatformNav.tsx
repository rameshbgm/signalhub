"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Activity, Building2, KeyRound, Landmark, ScrollText, SlidersHorizontal, UsersRound, type LucideIcon } from "lucide-react";
import type { Hue } from "@/components/ui/icon-tile";
import { cn } from "@/lib/utils";

const TABS: Array<{ href: string; label: string; icon: LucideIcon; hue: Hue }> = [
  { href: "/organization/platform", label: "Overview", icon: Landmark, hue: "violet" },
  { href: "/organization/platform/orgs", label: "Organizations", icon: Building2, hue: "sky" },
  { href: "/organization/platform/users", label: "Users", icon: UsersRound, hue: "emerald" },
  { href: "/organization/platform/operations", label: "Operations", icon: Activity, hue: "amber" },
  { href: "/organization/platform/audit", label: "Audit", icon: ScrollText, hue: "rose" },
  { href: "/organization/platform/configuration", label: "Configuration", icon: SlidersHorizontal, hue: "teal" },
  { href: "/organization/platform/identity", label: "Identity", icon: KeyRound, hue: "indigo" },
];

function isActive(pathname: string, href: string) {
  return href === "/organization/platform" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** Tab-style links for the platform administration screens; scrolls sideways inside its own box on narrow screens. */
export function PlatformNav() {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  return (
    <nav aria-label="Platform administration" className="-mx-1 overflow-x-auto px-1 py-1 [scrollbar-width:none]">
      <ul className="flex w-max min-w-full gap-1.5">
        {TABS.map(({ href, label, icon: Icon, hue }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} data-hue={hue}>
              <Link
                ref={active ? activeRef : undefined}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-semibold outline-none transition-all duration-200 ease-soft focus-visible:ring-4 focus-visible:ring-primary/25",
                  active ? "bg-gradient-to-r from-[var(--hue-from)] to-[var(--hue-to)] text-white shadow-[0_8px_18px_-8px_var(--hue-to)]" : "bg-surface text-ink-soft shadow-card ring-1 ring-line hover:-translate-y-px hover:text-[var(--hue-fg)]",
                )}
              >
                <Icon aria-hidden size={16} className="transition-transform duration-300 ease-spring group-hover:scale-125" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

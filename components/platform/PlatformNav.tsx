"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Activity, Building2, KeyRound, Landmark, ScrollText, ShieldCheck, SlidersHorizontal, UserCog, UsersRound, type LucideIcon } from "lucide-react";
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
  // Tenant-scoped, so these live outside /platform.
  { href: "/organization/security", label: "Security", icon: ShieldCheck, hue: "rose" },
  { href: "/organization/api-keys", label: "API Keys", icon: KeyRound, hue: "teal" },
  { href: "/organization/team", label: "Users & Roles", icon: UserCog, hue: "indigo" },
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
    <nav aria-label="Platform administration" className="overflow-x-auto border-b border-line [scrollbar-width:none]">
      <ul className="flex w-max min-w-full gap-1">
        {TABS.map(({ href, label, icon: Icon, hue }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} data-hue={hue}>
              <Link
                ref={active ? activeRef : undefined}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex h-10 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-primary/30",
                  active ? "border-primary text-ink" : "border-transparent text-ink-soft hover:border-line-strong hover:text-ink",
                )}
              >
                <Icon aria-hidden size={16} className={active ? "text-[var(--hue-fg)]" : "text-ink-dim"} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

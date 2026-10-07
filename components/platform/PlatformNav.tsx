"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Activity, Building2, KeyRound, Landmark, ScrollText, Settings2, ShieldCheck, SlidersHorizontal, UserCog, UsersRound, type LucideIcon } from "lucide-react";
import type { Hue } from "@/components/ui/icon-tile";
import { cn } from "@/lib/utils";

const TABS: Array<{ href: string; label: string; icon: LucideIcon; hue: Hue }> = [
  { href: "/organization/platform", label: "Overview", icon: Landmark, hue: "violet" },
  { href: "/organization/platform/orgs", label: "Organizations", icon: Building2, hue: "sky" },
  // Tenant-scoped, so it lives outside /platform and stays open to org owners without the platform role.
  { href: "/organization/settings", label: "Organization settings", icon: Settings2, hue: "slate" },
  { href: "/organization/platform/users", label: "Users", icon: UsersRound, hue: "emerald" },
  { href: "/organization/platform/operations", label: "Operations", icon: Activity, hue: "amber" },
  { href: "/organization/platform/audit", label: "Audit", icon: ScrollText, hue: "rose" },
  { href: "/organization/platform/configuration", label: "Configuration", icon: SlidersHorizontal, hue: "teal" },
  { href: "/organization/platform/identity", label: "Identity", icon: KeyRound, hue: "indigo" },
  // Tenant-scoped like Organization settings.
  { href: "/organization/security", label: "Security", icon: ShieldCheck, hue: "rose" },
  { href: "/organization/team", label: "Users & Roles", icon: UserCog, hue: "indigo" },
];

function isActive(pathname: string, href: string) {
  return href === "/organization/platform" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

const ORGANIZATION_ONLY = new Set(["/organization/settings"]);

/**
 * Tab-style links for the platform administration screens; scrolls sideways inside its own box on narrow screens.
 * Without `platformAccess` only the organization settings tab is shown.
 */
export function PlatformNav({ platformAccess = true }: { platformAccess?: boolean }) {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  return (
    <nav aria-label="Platform administration" className="overflow-x-auto border-b border-line [scrollbar-width:none]">
      <ul className="flex w-max min-w-full gap-1">
        {TABS.filter(({ href }) => platformAccess || ORGANIZATION_ONLY.has(href)).map(({ href, label, icon: Icon, hue }) => {
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

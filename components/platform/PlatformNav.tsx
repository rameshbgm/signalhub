"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Activity, Building2, KeyRound, Landmark, ScrollText, SlidersHorizontal, UsersRound, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/organization/platform", label: "Overview", icon: Landmark },
  { href: "/organization/platform/orgs", label: "Organizations", icon: Building2 },
  { href: "/organization/platform/users", label: "Users", icon: UsersRound },
  { href: "/organization/platform/operations", label: "Operations", icon: Activity },
  { href: "/organization/platform/audit", label: "Audit", icon: ScrollText },
  { href: "/organization/platform/configuration", label: "Configuration", icon: SlidersHorizontal },
  { href: "/organization/platform/identity", label: "Identity", icon: KeyRound },
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
    <nav aria-label="Platform administration" data-hue="violet" className="overflow-x-auto rounded-card border border-line bg-surface p-1 shadow-card [scrollbar-width:thin]">
      <ul className="flex w-max min-w-full gap-1">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                ref={active ? activeRef : undefined}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-control px-3.5 text-sm font-medium outline-none transition-colors duration-200 focus-visible:ring-4 focus-visible:ring-primary/25 sm:min-h-10",
                  active ? "bg-[var(--hue-bg)] text-[var(--hue-fg)]" : "text-ink-soft hover:bg-sunken hover:text-ink",
                )}
              >
                <Icon aria-hidden size={16} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

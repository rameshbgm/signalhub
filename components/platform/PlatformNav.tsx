"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Activity, Landmark, ScrollText, ShieldCheck, SlidersHorizontal, UsersRound, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The six sections of Platform administration, from what is happening to how it runs. `also` lists
 * the other routes that belong to a section (its sub-tabs), so the section stays highlighted on them;
 * Security and API keys are tenant-scoped, so they live outside /platform.
 */
const TABS: Array<{ href: string; label: string; icon: LucideIcon; also?: string[] }> = [
  { href: "/organization/platform", label: "Overview", icon: Landmark },
  { href: "/organization/platform/configuration", label: "Configuration", icon: SlidersHorizontal, also: ["/organization/platform/deployment"] },
  { href: "/organization/platform/users", label: "User management", icon: UsersRound },
  { href: "/organization/platform/audit", label: "Audit", icon: ScrollText },
  { href: "/organization/platform/identity", label: "Security", icon: ShieldCheck, also: ["/organization/security", "/organization/api-keys", "/organization/platform/mfa-requests"] },
  { href: "/organization/platform/operations", label: "Operations", icon: Activity },
];

function isActive(pathname: string, tab: (typeof TABS)[number]) {
  const matches = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return tab.href === "/organization/platform" ? pathname === tab.href : [tab.href, ...(tab.also ?? [])].some(matches);
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
        {TABS.map((tab) => {
          const { href, label, icon: Icon } = tab;
          const active = isActive(pathname, tab);
          return (
            <li key={href} data-hue="violet">
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

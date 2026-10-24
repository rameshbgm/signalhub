import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type SectionTab = { id: string; label: string; icon: LucideIcon; href: string; count?: number };

/**
 * Underlined tabs for the pages inside one Platform administration section
 * (User management, Operations, Audit, Configuration, Identity). Same look
 * everywhere; a tab may show how many rows it holds.
 */
export function SectionTabs({ label, tabs, active }: { label: string; tabs: SectionTab[]; active: string }) {
  return (
    <nav aria-label={label} className="overflow-x-auto border-b border-line [scrollbar-width:none]">
      <ul className="flex w-max min-w-full gap-1">
        {tabs.map(({ id, label: text, icon: Icon, href, count }) => (
          <li key={id}>
            <Link href={href} aria-current={active === id ? "page" : undefined}
              className={cn("-mb-px inline-flex h-11 items-center gap-2 whitespace-nowrap border-b-2 px-4 text-sm font-semibold outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-primary/30",
                active === id ? "border-primary text-ink" : "border-transparent text-ink-soft hover:border-line-strong hover:text-ink")}>
              <Icon aria-hidden size={16} className={active === id ? "text-primary" : "text-ink-dim"} />
              {text}
              {count !== undefined && <span className={cn("rounded-chip px-1.5 py-0.5 text-2xs font-semibold tabular-nums", active === id ? "bg-primary-soft text-primary-ink" : "bg-sunken text-ink-soft")}>{count}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

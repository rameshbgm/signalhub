"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const GROUPS = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: "◧" },
      { href: "/admin/pages", label: "Pages", icon: "▦" },
      { href: "/admin/audit-log", label: "Audit Log", icon: "≣" },
      { href: "/admin/help", label: "Help Center", icon: "?" },
    ],
  },
  {
    label: "Incidents",
    items: [
      { href: "/admin/incidents", label: "Incidents", icon: "!" },
      { href: "/admin/maintenance", label: "Maintenance", icon: "⟲" },
      { href: "/admin/templates", label: "Templates", icon: "▤" },
    ],
  },
  {
    label: "Communicate",
    items: [
      { href: "/admin/subscribers", label: "Subscribers", icon: "@" },
      { href: "/admin/metrics", label: "Metrics", icon: "▲" },
      { href: "/admin/monitors", label: "Monitors", icon: "◉" },
      { href: "/admin/embed", label: "Status Embed", icon: "◨" },
      { href: "/admin/third-party", label: "Third-Party Catalog", icon: "◈" },
    ],
  },
  {
    label: "Organization",
    items: [
      { href: "/admin/team", label: "Team", icon: "◐" },
      { href: "/admin/api-keys", label: "API Keys", icon: "⚿" },
      { href: "/admin/billing", label: "Billing", icon: "$" },
      { href: "/admin/settings", label: "Settings", icon: "⚙" },
    ],
  },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 overflow-y-auto py-4">
      {GROUPS.map((group) => (
        <div key={group.label} className="mb-5">
          <p className="px-4 mb-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-soft)]/60">{group.label}</p>
          {group.items.map((item) => {
            const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                  active
                    ? "bg-[var(--up-soft)] text-[var(--ink)] font-semibold"
                    : "text-[var(--ink-soft)] hover:bg-black/[0.03] hover:text-[var(--ink)]"
                }`}
              >
                {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-[var(--up)]" aria-hidden />}
                <span className={`w-4 text-center text-xs ${active ? "text-[var(--up)]" : "text-[var(--ink-soft)]/50"}`} aria-hidden>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

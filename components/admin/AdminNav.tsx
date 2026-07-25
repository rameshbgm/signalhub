"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Capability } from "@/lib/identity";

const GROUPS = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: "◧" },
      { href: "/admin/pages", label: "Pages", icon: "▦" },
      { href: "/admin/analytics", label: "Analytics", icon: "↗", capability: "analytics.view" },
      { href: "/admin/audit-log", label: "Audit Log", icon: "≣", capability: "audit.view" },
      { href: "/admin/help", label: "Help Center", icon: "?" },
    ],
  },
  {
    label: "Incidents",
    items: [
      { href: "/admin/incidents", label: "Incidents", icon: "!" },
      { href: "/admin/maintenance", label: "Maintenance", icon: "⟲" },
      { href: "/admin/templates", label: "Templates", icon: "▤", capability: "incident.manage" },
    ],
  },
  {
    label: "Communicate",
    items: [
      { href: "/admin/subscribers", label: "Subscribers", icon: "@", capability: "subscriber.manage" },
      { href: "/admin/notifications", label: "Destinations", icon: "↗", capability: "integration.manage" },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { href: "/admin/metrics", label: "Metrics", icon: "▲" },
      { href: "/admin/monitors", label: "Monitors", icon: "◉" },
    ],
  },
  {
    label: "Integrations",
    items: [
      { href: "/admin/embed", label: "SignalHub Embed", icon: "◨", capability: "integration.manage" },
      { href: "/admin/third-party", label: "Monitor Templates", icon: "◈", capability: "integration.manage" },
      { href: "/admin/api-keys", label: "API Keys", icon: "⚿", capability: "integration.manage" },
    ],
  },
  {
    label: "Organization",
    items: [
      { href: "/admin/security", label: "Security", icon: "◇" },
      { href: "/admin/team", label: "Team", icon: "◐", capability: "team.manage" },
      { href: "/admin/settings", label: "Settings", icon: "⚙", capability: "organization.manage" },
    ],
  },
];

export function AdminNav({ capabilities }: { capabilities: Capability[] }) {
  const pathname = usePathname();
  const allowed = new Set(capabilities);

  return (
    <nav className="flex gap-4 overflow-x-auto px-3 py-3 lg:flex-1 lg:flex-col lg:gap-0 lg:overflow-y-auto lg:overflow-x-visible lg:px-0 lg:py-4">
      {GROUPS.map((group) => {
        const items = group.items.filter(
          (item) => !("capability" in item) || !item.capability || allowed.has(item.capability as Capability)
        );
        if (items.length === 0) return null;
        return (
        <div key={group.label} className="shrink-0 lg:mb-5 lg:shrink">
          <p className="mb-1.5 px-1 font-mono text-[10px] uppercase tracking-wider text-[var(--fg-dim)] lg:px-4">{group.label}</p>
          <div className="flex gap-1 lg:block lg:gap-0">
            {items.map((item) => {
              const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex shrink-0 items-center gap-2.5 whitespace-nowrap border border-transparent px-3 py-2 font-mono text-xs transition-colors lg:px-4 lg:text-sm ${
                    active
                      ? "border-[var(--line-bright)] bg-[var(--cyan-soft)] text-[var(--cyan)] font-semibold"
                      : "text-[var(--fg-soft)] hover:bg-[var(--hover-overlay)] hover:text-[var(--fg)]"
                  }`}
                >
                  {active && <span className="absolute left-0 top-1 bottom-1 hidden w-[2px] bg-[var(--cyan)] lg:block" aria-hidden />}
                  <span className={`w-4 text-center text-xs ${active ? "text-[var(--cyan)]" : "text-[var(--fg-dim)]"}`} aria-hidden>
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
        );
      })}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Capability } from "@/lib/identity";

const GROUPS = [
  {
    label: "Overview",
    items: [
      { href: "/organization", label: "Dashboard", icon: "◧" },
      { href: "/organization/pages", label: "Pages", icon: "▦" },
      { href: "/organization/pages/deleted", label: "Deleted Pages", icon: "⌫", capability: "page.configure" },
      { href: "/organization/analytics", label: "Analytics", icon: "↗", capability: "analytics.view" },
      { href: "/organization/audit-log", label: "Audit Log", icon: "≣", capability: "audit.view" },
      { href: "/organization/help", label: "Help Center", icon: "?" },
    ],
  },
  {
    label: "Incidents",
    items: [
      { href: "/organization/incidents", label: "Incidents", icon: "!" },
      { href: "/organization/maintenance", label: "Maintenance", icon: "⟲" },
      { href: "/organization/templates", label: "Templates", icon: "▤", capability: "incident.manage" },
    ],
  },
  {
    label: "Communicate",
    items: [
      { href: "/organization/subscribers", label: "Subscribers", icon: "@", capability: "subscriber.manage" },
      { href: "/organization/notifications", label: "Destinations", icon: "↗", capability: "integration.manage" },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { href: "/organization/metrics", label: "Metrics", icon: "▲" },
      { href: "/organization/monitors", label: "Monitors", icon: "◉" },
    ],
  },
  {
    label: "Integrations",
    items: [
      { href: "/organization/embed", label: "SignalHub Embed", icon: "◨", capability: "integration.manage" },
      { href: "/organization/third-party", label: "Monitor Templates", icon: "◈", capability: "integration.manage" },
      { href: "/organization/api-keys", label: "API Keys", icon: "⚿", capability: "integration.manage" },
    ],
  },
  {
    label: "Organization",
    items: [
      { href: "/organization/security", label: "Security", icon: "◇" },
      { href: "/organization/team", label: "Users & Roles", icon: "◐", capability: "team.manage" },
      { href: "/organization/settings", label: "Settings", icon: "⚙", capability: "organization.manage" },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/organization/platform", label: "Overview", icon: "◆", capability: "organization.manage" },
      { href: "/organization/platform/orgs", label: "Organizations", icon: "◎", capability: "organization.manage" },
      { href: "/organization/platform/users", label: "Global Users", icon: "◉", capability: "organization.manage" },
      { href: "/organization/platform/operations", label: "Operations", icon: "◈", capability: "organization.manage" },
      { href: "/organization/platform/templates", label: "Monitor Templates", icon: "▤", capability: "organization.manage" },
      { href: "/organization/platform/configuration", label: "Configuration", icon: "⚙", capability: "organization.manage" },
      { href: "/organization/platform/identity", label: "Identity", icon: "◇", capability: "organization.manage" },
      { href: "/organization/platform/audit", label: "Platform Audit", icon: "≣", capability: "organization.manage" },
    ],
  },
];

export function AdminNav({ capabilities }: { capabilities: Capability[] }) {
  const pathname = usePathname();
  const allowed = new Set(capabilities);

  return (
    <nav className="flex flex-1 flex-col overflow-y-auto px-0 py-4">
      {GROUPS.map((group) => {
        const items = group.items.filter(
          (item) => !("capability" in item) || !item.capability || allowed.has(item.capability as Capability)
        );
        if (items.length === 0) return null;
        return (
        <div key={group.label} className="mb-5 shrink-0">
          <p className="mb-1.5 px-4 font-mono text-[10px] uppercase tracking-wider text-[var(--fg-dim)]">{group.label}</p>
          <div>
            {items.map((item) => {
              const active = item.href === "/organization" || item.href === "/organization/pages"
                ? pathname === item.href
                : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex shrink-0 items-center gap-2.5 whitespace-nowrap border border-transparent px-4 py-2 font-mono text-sm transition-colors ${
                    active
                      ? "border-[var(--line-bright)] bg-[var(--cyan-soft)] text-[var(--cyan)] font-semibold"
                      : "text-[var(--fg-soft)] hover:bg-[var(--hover-overlay)] hover:text-[var(--fg)]"
                  }`}
                >
                  {active && <span className="absolute bottom-1 left-0 top-1 w-[2px] bg-[var(--cyan)]" aria-hidden />}
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

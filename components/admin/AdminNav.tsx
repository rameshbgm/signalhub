"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BellRing,
  BookOpen,
  ChartNoAxesCombined,
  Code2,
  Gauge,
  KeyRound,
  Landmark,
  LayoutDashboard,
  MonitorDot,
  PanelsTopLeft,
  Settings2,
  ShieldCheck,
  Siren,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Capability } from "@/lib/identity";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  capability?: Capability;
};

const GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Workspace",
    items: [
      { href: "/organization", label: "Dashboard", icon: LayoutDashboard },
      { href: "/organization/pages", label: "Pages", icon: PanelsTopLeft },
    ],
  },
  {
    label: "Operate",
    items: [
      { href: "/organization/incidents", label: "Incidents", icon: Siren },
      { href: "/organization/maintenance", label: "Maintenance", icon: Wrench },
      { href: "/organization/monitors", label: "Monitors", icon: MonitorDot },
      { href: "/organization/metrics", label: "Metrics", icon: Gauge },
    ],
  },
  {
    label: "Audience",
    items: [
      { href: "/organization/subscribers", label: "Subscribers", icon: UsersRound, capability: "subscriber.manage" },
      { href: "/organization/notifications", label: "Destinations", icon: BellRing, capability: "integration.manage" },
      { href: "/organization/analytics", label: "Analytics", icon: ChartNoAxesCombined, capability: "analytics.view" },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/organization/embed", label: "SignalHub Embed", icon: Code2, capability: "integration.manage" },
      { href: "/organization/api-keys", label: "API Keys", icon: KeyRound, capability: "integration.manage" },
      { href: "/organization/help", label: "Help Center", icon: BookOpen },
    ],
  },
  {
    label: "Organization",
    items: [
      { href: "/organization/security", label: "Security", icon: ShieldCheck },
      { href: "/organization/team", label: "Users & Roles", icon: UsersRound, capability: "team.manage" },
      { href: "/organization/settings", label: "Settings", icon: Settings2, capability: "organization.manage" },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/organization/platform", label: "Platform administration", icon: Landmark, capability: "organization.manage" },
    ],
  },
];

export function AdminNav({ capabilities }: { capabilities: Capability[] }) {
  const pathname = usePathname();
  const allowed = new Set(capabilities);

  return (
    <nav aria-label="Organization navigation" className="dispatch-nav">
      {GROUPS.map((group) => {
        const items = group.items.filter((item) => !item.capability || allowed.has(item.capability));
        if (items.length === 0) return null;
        return (
        <section key={group.label} className="dispatch-nav-group">
          <p className="dispatch-nav-label">{group.label}</p>
          <div className="dispatch-nav-items">
            {items.map((item) => {
              const active = item.href === "/organization"
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`dispatch-nav-link ${
                    active
                      ? "dispatch-nav-link--active"
                      : ""
                  }`}
                >
                  <Icon size={14} strokeWidth={active ? 2.4 : 1.8} aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </section>
        );
      })}
    </nav>
  );
}

"use client";

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
  Sparkles,
  UsersRound,
  Wrench,
  Building2,
  type LucideIcon,
} from "lucide-react";
import type { Hue } from "@/components/ui/icon-tile";
import type { Capability } from "@/lib/identity";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  hue: Hue;
  capability?: Capability;
};

export type NavSection = {
  id: string;
  label: string;
  /** Shorter name for the mobile tab bar, where each tab is about 65px wide. */
  tabLabel?: string;
  icon: LucideIcon;
  hue: Hue;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "workspace",
    label: "Workspace",
    icon: LayoutDashboard,
    hue: "indigo",
    items: [
      { href: "/organization", label: "Dashboard", icon: LayoutDashboard, hue: "indigo" },
      { href: "/organization/pages", label: "Pages", icon: PanelsTopLeft, hue: "violet" },
    ],
  },
  {
    id: "operate",
    label: "Operate",
    icon: Siren,
    hue: "amber",
    items: [
      { href: "/organization/incidents", label: "Incidents", icon: Siren, hue: "amber", capability: "incident.update" },
      { href: "/organization/maintenance", label: "Maintenance", icon: Wrench, hue: "amber", capability: "incident.update" },
      { href: "/organization/monitors", label: "Monitors", icon: MonitorDot, hue: "sky", capability: "monitor.manage" },
      { href: "/organization/metrics", label: "Metrics", icon: Gauge, hue: "sky", capability: "monitor.manage" },
    ],
  },
  {
    id: "audience",
    label: "Audience",
    icon: UsersRound,
    hue: "emerald",
    items: [
      { href: "/organization/subscribers", label: "Subscribers", icon: UsersRound, hue: "emerald", capability: "subscriber.manage" },
      { href: "/organization/notifications", label: "Destinations", icon: BellRing, hue: "teal", capability: "integration.manage" },
      { href: "/organization/analytics", label: "Analytics", icon: ChartNoAxesCombined, hue: "violet", capability: "analytics.view" },
    ],
  },
  {
    id: "tools",
    label: "Tools",
    icon: Sparkles,
    hue: "teal",
    items: [
      { href: "/organization/embed", label: "SignalHub Embed", icon: Code2, hue: "teal", capability: "integration.manage" },
      { href: "/organization/api-keys", label: "API Keys", icon: KeyRound, hue: "teal", capability: "integration.manage" },
      { href: "/organization/help", label: "Help Center", icon: BookOpen, hue: "slate" },
    ],
  },
  {
    id: "organization",
    label: "Organization",
    tabLabel: "Settings",
    icon: Building2,
    hue: "rose",
    items: [
      { href: "/organization/security", label: "Security", icon: ShieldCheck, hue: "rose" },
      { href: "/organization/team", label: "Users & Roles", icon: UsersRound, hue: "indigo", capability: "team.manage" },
      { href: "/organization/settings", label: "Settings", icon: Settings2, hue: "slate", capability: "organization.manage" },
    ],
  },
  {
    id: "platform",
    label: "Platform",
    icon: Landmark,
    hue: "violet",
    items: [
      { href: "/organization/platform", label: "Platform administration", icon: Landmark, hue: "violet", capability: "organization.manage" },
    ],
  },
];

/** Sections with at least one item the signed-in role may open. */
export function visibleSections(capabilities: Capability[]): NavSection[] {
  const allowed = new Set(capabilities);
  return NAV_SECTIONS
    .map((section) => ({ ...section, items: section.items.filter((item) => !item.capability || allowed.has(item.capability)) }))
    .filter((section) => section.items.length > 0);
}

export function isActivePath(pathname: string, href: string) {
  return href === "/organization" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** The section and item for the current route; the longest matching href wins. */
export function activeNav(sections: NavSection[], pathname: string) {
  let best: { section: NavSection; item: NavItem } | undefined;
  for (const section of sections) {
    for (const item of section.items) {
      if (isActivePath(pathname, item.href) && (!best || item.href.length > best.item.href.length)) best = { section, item };
    }
  }
  return best;
}

import Link from "next/link";
import { AlertTriangle, Boxes, CheckCircle2, CircleHelp, ExternalLink, LayoutDashboard, PanelsTopLeft, Plus, ShieldCheck, UsersRound, Wrench, XOctagon, type LucideIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IconTile, type Hue } from "@/components/ui/icon-tile";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { requireSession } from "@/lib/require-session";
import { database } from "@/lib/postgres/client";
import { getScopedPages } from "@/lib/admin-guard";
import { sessionHasCapability } from "@/lib/admin-guard";
import { publicPagePath } from "@/lib/public-path";
import {
  COMPONENT_STATUS_COLOR,
  COMPONENT_STATUS_LABEL,
  overallBanner,
  pageHealthStatus,
  worstStatus,
  type ComponentStatus,
  type PageHealthSignals,
} from "@/lib/status";

async function dashboardData(pageIds: string[]) {
  if (!pageIds.length) {
    return {
      openIncidentDocs: [],
      subscriberCount: 0,
      componentDocs: [],
      upcomingMaintenance: 0,
      activeMaintenanceDocs: [],
      monitorDocs: [],
    };
  }
  const [
    openIncidentDocs,
    subscriberCount,
    componentDocs,
    upcomingMaintenance,
    activeMaintenanceDocs,
    monitorDocs,
  ] = await Promise.all([
    database.selectFrom("incidents").selectAll().where("pageId", "in", pageIds)
      .where("isMaintenance", "=", false).where("status", "!=", "RESOLVED")
      .orderBy("createdAt", "desc").execute(),
    database.selectFrom("subscribers").select(({ fn }) => fn.countAll<number>().as("count"))
      .where("pageId", "in", pageIds).executeTakeFirstOrThrow().then((row) => Number(row.count)),
    database.selectFrom("components").selectAll().where("pageId", "in", pageIds).execute(),
    database.selectFrom("incidents").select(({ fn }) => fn.countAll<number>().as("count"))
      .where("pageId", "in", pageIds).where("isMaintenance", "=", true)
      .where("maintenanceStatus", "=", "SCHEDULED").executeTakeFirstOrThrow().then((row) => Number(row.count)),
    database.selectFrom("incidents").selectAll().where("pageId", "in", pageIds)
      .where("isMaintenance", "=", true).where("maintenanceStatus", "in", ["IN_PROGRESS", "VERIFYING"]).execute(),
    database.selectFrom("monitors").selectAll().where("pageId", "in", pageIds).where("enabled", "=", true).execute(),
  ]);
  return {
    openIncidentDocs,
    subscriberCount,
    componentDocs,
    upcomingMaintenance,
    activeMaintenanceDocs,
    monitorDocs,
  };
}

export default async function AdminDashboard() {
  const { session, org } = await requireSession();

  const pages = await getScopedPages(session, org.id);
  const pageIds = pages.map((p) => p.id);

  const {
    openIncidentDocs,
    subscriberCount,
    componentDocs,
    upcomingMaintenance,
    activeMaintenanceDocs,
    monitorDocs,
  } = await dashboardData(pageIds);
  const openIncidents = openIncidentDocs;

  const signalsByPage = new Map<string, PageHealthSignals>(
    pages.map((page) => [
      page.id,
      {
        componentStatuses: [],
        activeIncidentImpacts: [],
        maintenanceActive: false,
        downMonitorStatuses: [],
        hasHealthyMonitor: false,
      },
    ])
  );
  for (const component of componentDocs) {
    signalsByPage.get(component.pageId)?.componentStatuses.push(component.status);
  }
  for (const incident of openIncidentDocs) {
    signalsByPage.get(incident.pageId)?.activeIncidentImpacts.push(incident.impact);
  }
  for (const maintenance of activeMaintenanceDocs) {
    const signals = signalsByPage.get(maintenance.pageId);
    if (signals) signals.maintenanceActive = true;
  }
  for (const monitor of monitorDocs) {
    const signals = signalsByPage.get(monitor.pageId);
    if (!signals) continue;
    if (monitor.isDown) signals.downMonitorStatuses.push(monitor.downStatus);
    else if (monitor.lastOk === true) signals.hasHealthyMonitor = true;
  }

  const pageHealthById = new Map(
    pages.map((page) => [page.id, pageHealthStatus(signalsByPage.get(page.id)!)])
  );
  for (const hub of pages.filter((page) => page.isHub)) {
    const childStatuses = pages
      .filter((page) => page.hubParentId === hub.id)
      .map((page) => pageHealthById.get(page.id))
      .filter((status): status is ComponentStatus => status !== null && status !== undefined);
    const directStatus = pageHealthById.get(hub.id);
    const statuses = directStatus ? [directStatus, ...childStatuses] : childStatuses;
    pageHealthById.set(hub.id, statuses.length ? worstStatus(statuses) : null);
  }

  const knownPageStatuses = pages
    .map((page) => pageHealthById.get(page.id))
    .filter((status): status is ComponentStatus => status !== null && status !== undefined);
  const hasUnknownPage = knownPageStatuses.length !== pages.length;
  const worstKnownStatus = knownPageStatuses.length ? worstStatus(knownPageStatuses) : null;
  const overallHealth =
    worstKnownStatus && worstKnownStatus !== "OPERATIONAL"
      ? worstKnownStatus
      : hasUnknownPage
        ? null
        : worstKnownStatus;
  const healthBanner = overallHealth ? overallBanner([overallHealth]) : null;
  const canConfigurePages = sessionHasCapability(session, "page.configure");

  const tone = healthTone(overallHealth);
  const HeroIcon = HERO_ICON[overallHealth ?? "UNKNOWN"];
  const canManageSubscribers = sessionHasCapability(session, "subscriber.manage");
  const canManageIncidents = sessionHasCapability(session, "incident.update");

  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" description={`Everything happening across ${org.name}, at a glance.`} icon={LayoutDashboard} hue="indigo" />

      <section aria-label="Overall health" className={cn("flex flex-wrap items-center gap-4 rounded-card border p-5", HERO_TONE[tone])}>
        <HeroIcon aria-hidden size={26} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink">
            {tone === "ok" && <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-ok text-ok animate-pulse-ring" />}
            {healthBanner?.label ?? "Health data unavailable"}
          </p>
          <p className="mt-0.5 text-sm text-ink-soft">
            {pages.length === 0
              ? "Create a page to start tracking the health of your services."
              : `Tracking ${plural(pages.length, "page")}, ${plural(componentDocs.length, "component")}, and ${plural(monitorDocs.length, "active monitor")}.`}
          </p>
        </div>
      </section>

      <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Pages" value={pages.length} icon={PanelsTopLeft} hue="violet" href="/organization/pages" />
        <StatTile label="Components" value={componentDocs.length} icon={Boxes} hue="sky" />
        <StatTile label="Subscribers" value={subscriberCount} icon={UsersRound} hue="emerald" href={canManageSubscribers ? "/organization/subscribers" : undefined} />
        <StatTile label="Upcoming maintenance" value={upcomingMaintenance} icon={Wrench} hue="amber" href={canManageIncidents ? "/organization/events?show=maintenance" : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="h-14 flex-row items-center justify-between py-0">
            <h2 className="text-[0.9375rem] font-semibold tracking-tight">Open incidents</h2>
            {openIncidents.length > 0 && <StatusBadge tone="warn">{openIncidents.length} open</StatusBadge>}
          </CardHeader>
          <CardContent>
            {openIncidents.length === 0 ? (
              <EmptyState icon={CheckCircle2} hue="emerald" title="No open incidents" description="Everything is running normally. Incidents you declare will appear here." className="border-0 bg-transparent py-8" />
            ) : (
              <ul className="space-y-2">
                {openIncidents.map((inc) => (
                  <li key={inc.id}>
                    <Link href={`/organization/incidents/${inc.id}`} className="group flex items-center justify-between gap-3 rounded-control border border-line px-3.5 py-2.5 text-sm outline-none transition-colors duration-150 hover:bg-sunken/60 focus-visible:ring-4 focus-visible:ring-primary/25">
                      <span className="min-w-0 truncate font-medium text-ink">{inc.name}</span>
                      <StatusBadge tone="warn">{titleCase(inc.status)}</StatusBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="h-14 flex-row items-center justify-between py-0">
            <h2 className="text-[0.9375rem] font-semibold tracking-tight">Your pages</h2>
            {canConfigurePages && <Link href="/organization/pages/new" className={buttonVariants({ variant: "soft", size: "sm" })}><Plus aria-hidden size={14} />New page</Link>}
          </CardHeader>
          <CardContent>
            {pages.length === 0 ? (
              <EmptyState icon={PanelsTopLeft} hue="violet" title="No pages yet" description="A status page shows your customers what is up, what is down, and what you are doing about it." className="border-0 bg-transparent py-8" action={canConfigurePages ? <Link href="/organization/pages/new" className={buttonVariants()}>Create a page</Link> : undefined} />
            ) : (
              <ul className="space-y-2">
                {pages.map((p) => {
                  const health = pageHealthById.get(p.id);
                  const label = health ? COMPONENT_STATUS_LABEL[health] : "Health data unavailable";
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-3 rounded-control border border-line px-3.5 py-3 text-sm">
                      <div className="flex min-w-0 items-center gap-3">
                        <span role="img" aria-label={label} title={label} className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: health ? COMPONENT_STATUS_COLOR[health] : "var(--color-ink-dim)" }} />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{p.name}</p>
                          <p className="text-xs text-ink-dim">{titleCase(p.type)}{p.isHub ? " hub" : ""}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {p.publicVisible !== false && <a href={publicPagePath(p)} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })}>View<ExternalLink aria-hidden size={13} /></a>}
                        {canConfigurePages && <Link href={`/organization/pages/${p.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>Manage</Link>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

type HealthTone = "ok" | "warn" | "danger" | "info" | "neutral";

function healthTone(status: ComponentStatus | null): HealthTone {
  if (status === null) return "neutral";
  if (status === "OPERATIONAL") return "ok";
  if (status === "MAJOR_OUTAGE") return "danger";
  if (status === "UNDER_MAINTENANCE") return "info";
  return "warn";
}

const HERO_TONE: Record<HealthTone, string> = {
  ok: "border-ok/25 bg-gradient-to-r from-ok-bg/60 to-surface text-ok-fg",
  warn: "border-warn/35 bg-gradient-to-r from-warn-bg/60 to-surface text-warn-fg",
  danger: "border-danger/25 bg-gradient-to-r from-danger-bg/60 to-surface text-danger-fg",
  info: "border-info/25 bg-gradient-to-r from-info-bg/60 to-surface text-info-fg",
  neutral: "border-line bg-surface text-ink-soft",
};


const HERO_ICON: Record<ComponentStatus | "UNKNOWN", LucideIcon> = {
  OPERATIONAL: ShieldCheck,
  DEGRADED_PERFORMANCE: AlertTriangle,
  PARTIAL_OUTAGE: AlertTriangle,
  MAJOR_OUTAGE: XOctagon,
  UNDER_MAINTENANCE: Wrench,
  UNKNOWN: CircleHelp,
};

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function titleCase(value: string) {
  const text = value.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function StatTile({ label, value, icon, hue, href }: { label: string; value: number; icon: LucideIcon; hue: Hue; href?: string }) {
  const content = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink-soft">{label}</p>
        <IconTile icon={icon} hue={hue} size="sm" />
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-ink">{value}</p>
      </>
  );
  const box = "rounded-card border border-line bg-surface p-4 shadow-card";
  if (!href) return <div data-hue={hue} className={box}>{content}</div>;
  return <Link href={href} data-hue={hue} className={cn(box, "block outline-none transition-[border-color,box-shadow] duration-150 hover:border-line-strong hover:shadow-raised focus-visible:ring-4 focus-visible:ring-primary/25")}>{content}</Link>;
}

import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { CalendarClock, ChevronRight, History, Plus, Siren, TriangleAlert, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { incidentStatusTone, maintenanceStatusTone } from "@/components/admin/operate-ui";
import { assertPageInOrg, requireCapability, sessionHasCapability } from "@/lib/admin-guard";
import { formatPageDate } from "@/lib/page-locale";
import { eventHref, groupPageEvents } from "@/lib/page-events";
import { database } from "@/lib/postgres/client";
import { IMPACT_LABEL, INCIDENT_STATUS_LABEL, MAINTENANCE_STATUS_LABEL, type Impact, type IncidentStatus, type MaintenanceStatus } from "@/lib/status";

const HISTORY_FILTERS = [
  { key: "all", label: "All" },
  { key: "incidents", label: "Incidents" },
  { key: "maintenance", label: "Maintenance" },
] as const;

export default async function PageEvents({ params, searchParams }: { params: Promise<{ pageId: string }>; searchParams: Promise<{ show?: string }> }) {
  const { pageId } = await params;
  const { show } = await searchParams;
  const session = await requireCapability("incident.update", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const page = await database.selectFrom("pages").select(["id", "isHub", "language", "timezone"])
    .where("id", "=", pageId).where("orgId", "=", session.orgId).where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!page || page.isHub) notFound();
  const canManage = sessionHasCapability(session, "incident.manage");

  // ponytail: newest 200 events per page; add paging when a page's history outgrows it.
  const events = await database.selectFrom("incidents")
    .select(["id", "name", "status", "impact", "isMaintenance", "maintenanceStatus", "scheduledStart", "scheduledEnd", "createdAt", "resolvedAt"])
    .where("pageId", "=", pageId).orderBy("createdAt", "desc").limit(200).execute();
  const { active, upcoming, history } = groupPageEvents(events);
  const historyFilter = HISTORY_FILTERS.find((filter) => filter.key === show)?.key ?? "all";
  const shownHistory = historyFilter === "all" ? history : history.filter((event) => event.isMaintenance === (historyFilter === "maintenance"));

  const date = (value: Date) => formatPageDate(value, { language: page.language, timeZone: page.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const base = `/organization/pages/${pageId}/events`;
  const row = (event: (typeof events)[number]) => {
    if (!event.isMaintenance) {
      return (
        <EventRow key={event.id} href={eventHref(event)} icon={TriangleAlert} title={event.name}
          meta={event.resolvedAt ? `Incident · Resolved ${date(event.resolvedAt)}` : `Incident · Opened ${date(event.createdAt)}`}>
          <Badge>{IMPACT_LABEL[event.impact as Impact]}</Badge>
          <StatusBadge tone={incidentStatusTone(event.status)}>{INCIDENT_STATUS_LABEL[event.status as IncidentStatus]}</StatusBadge>
        </EventRow>
      );
    }
    const status = (event.maintenanceStatus ?? "SCHEDULED") as MaintenanceStatus;
    const window = event.scheduledStart ? `${date(event.scheduledStart)}${event.scheduledEnd ? ` – ${date(event.scheduledEnd)}` : ""}` : "Time to be decided";
    return (
      <EventRow key={event.id} href={eventHref(event)} icon={Wrench} title={event.name} meta={`Maintenance · ${window}`}>
        <StatusBadge tone={maintenanceStatusTone(status)}>{MAINTENANCE_STATUS_LABEL[status]}</StatusBadge>
      </EventRow>
    );
  };

  const createActions = canManage && (
    <div className="flex flex-wrap gap-2">
      <Link href={`/organization/incidents/new?pageId=${pageId}`} className={buttonVariants({ size: "sm" })}>
        <Plus aria-hidden size={14} />
        Report incident
      </Link>
      <Link href={`/organization/maintenance/new?pageId=${pageId}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
        <CalendarClock aria-hidden size={14} />
        Schedule maintenance
      </Link>
    </div>
  );

  if (events.length === 0) {
    return (
      <EmptyState
        icon={Siren}
        hue="amber"
        title="No incidents or maintenance yet"
        description="Everything you report or schedule for this page shows up here: what is happening now, what is coming up, and what already happened."
        action={createActions || undefined}
        className="py-20"
      />
    );
  }

  return (
    <div className="space-y-6">
      {createActions && <div className="flex justify-end">{createActions}</div>}

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>Active now</CardTitle>
            <CardDescription>Open incidents and maintenance in progress. Visitors can see these.</CardDescription>
          </div>
          {active.length > 0 && <StatusBadge tone="warn">{active.length} active</StatusBadge>}
        </CardHeader>
        <CardContent className="py-2">
          {active.length ? <ul className="divide-y divide-line">{active.map(row)}</ul> : <p className="py-3 text-sm text-ink-dim">Nothing is happening right now.</p>}
        </CardContent>
      </Card>

      {upcoming.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Upcoming</CardTitle>
            <CardDescription>Scheduled maintenance, soonest first.</CardDescription>
          </CardHeader>
          <CardContent className="py-2">
            <ul className="divide-y divide-line">{upcoming.map(row)}</ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2"><History aria-hidden size={16} className="text-ink-dim" />History</CardTitle>
            <CardDescription>Resolved incidents and completed maintenance, newest first.</CardDescription>
          </div>
          <nav aria-label="Filter history" className="flex gap-1">
            {HISTORY_FILTERS.map((filter) => (
              <Link
                key={filter.key}
                href={filter.key === "all" ? base : `${base}?show=${filter.key}`}
                aria-current={historyFilter === filter.key ? "page" : undefined}
                className={buttonVariants({ variant: historyFilter === filter.key ? "secondary" : "ghost", size: "sm" })}
              >
                {filter.label}
              </Link>
            ))}
          </nav>
        </CardHeader>
        <CardContent className="py-2">
          {shownHistory.length ? <ul className="divide-y divide-line">{shownHistory.map(row)}</ul> : <p className="py-3 text-sm text-ink-dim">Nothing here yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function EventRow({ href, icon: Icon, title, meta, children }: { href: string; icon: typeof Siren; title: string; meta: string; children: ReactNode }) {
  return (
    <li>
      <Link href={href} className="group -mx-2 flex flex-col gap-2 rounded-control px-2 py-3 outline-none transition-colors duration-150 hover:bg-sunken/60 focus-visible:ring-4 focus-visible:ring-primary/25 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Icon aria-hidden size={16} className="mt-0.5 shrink-0 text-ink-dim" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{title}</p>
            <p className="mt-0.5 truncate text-xs text-ink-dim">{meta}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 pl-7 sm:pl-0">
          {children}
          <ChevronRight aria-hidden size={16} className="hidden text-ink-dim transition-transform duration-200 ease-spring group-hover:translate-x-0.5 sm:block" />
        </div>
      </Link>
    </li>
  );
}

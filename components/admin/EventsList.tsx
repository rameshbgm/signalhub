import Link from "next/link";
import type { ReactNode } from "react";
import { sql } from "kysely";
import { CalendarClock, ChevronLeft, ChevronRight, History, Plus, Siren, TriangleAlert, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { incidentStatusTone, maintenanceStatusTone } from "@/components/admin/operate-ui";
import { formatPageDate } from "@/lib/page-locale";
import { EVENT_KINDS, eventHref, eventsHref, groupPageEvents, isOpenEvent, type EventKind } from "@/lib/page-events";
import { database } from "@/lib/postgres/client";
import { IMPACT_LABEL, INCIDENT_STATUS_LABEL, MAINTENANCE_STATUS_LABEL, type Impact, type IncidentStatus, type MaintenanceStatus } from "@/lib/status";

const HISTORY_PAGE_SIZE = 50;
const COLUMNS = ["id", "pageId", "name", "status", "impact", "isMaintenance", "maintenanceStatus", "scheduledStart", "scheduledEnd", "createdAt", "resolvedAt"] as const;

/** Active, upcoming and paged past incidents and maintenance for the given pages. */
export async function EventsList({ pageIds, filteredPageId, pageNameById, kind, historyPage, canManage, locale }: {
  pageIds: string[];
  filteredPageId?: string;
  /** Set when the list spans several pages, so each row names its page. */
  pageNameById?: Record<string, string>;
  kind: EventKind;
  historyPage: number;
  canManage: boolean;
  locale?: { language?: string | null; timeZone?: string | null };
}) {
  const ofKind = (event: { isMaintenance: boolean }) => kind === "all" || event.isMaintenance === (kind === "maintenance");
  const [openEvents, historyRows] = pageIds.length
    ? await Promise.all([
      // Open events stay few, so they load in full; the filter applies after, so we can say what it hides.
      database.selectFrom("incidents").select(COLUMNS).where("pageId", "in", pageIds).where(isOpenEvent).execute(),
      database.selectFrom("incidents").select(COLUMNS).where("pageId", "in", pageIds).where((eb) => eb.not(isOpenEvent(eb)))
        .$if(kind !== "all", (query) => query.where("isMaintenance", "=", kind === "maintenance"))
        // Same order as groupPageEvents: maintenance by its window, incidents by when they opened.
        .orderBy(sql`coalesce(case when ${sql.ref("isMaintenance")} then ${sql.ref("scheduledStart")} end, ${sql.ref("createdAt")})`, "desc")
        .orderBy("id")
        .limit(HISTORY_PAGE_SIZE + 1).offset((historyPage - 1) * HISTORY_PAGE_SIZE).execute(),
    ])
    : [[], []];
  const { active, upcoming } = groupPageEvents(openEvents.filter(ofKind));
  const hidden = openEvents.filter((event) => !ofKind(event));
  const history = historyRows.slice(0, HISTORY_PAGE_SIZE);
  const hasOlder = historyRows.length > HISTORY_PAGE_SIZE;

  const date = (value: Date) => formatPageDate(value, { ...locale, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const pagePrefix = (pageId: string) => (pageNameById ? `${pageNameById[pageId] ?? "Unknown page"} · ` : "");
  const row = (event: (typeof openEvents)[number]) => {
    if (!event.isMaintenance) {
      return (
        <EventRow key={event.id} href={eventHref(event)} icon={TriangleAlert} title={event.name}
          meta={`${pagePrefix(event.pageId)}Incident · ${event.resolvedAt ? `Resolved ${date(event.resolvedAt)}` : `Opened ${date(event.createdAt)}`}`}>
          <Badge>{IMPACT_LABEL[event.impact as Impact]}</Badge>
          <StatusBadge tone={incidentStatusTone(event.status)}>{INCIDENT_STATUS_LABEL[event.status as IncidentStatus]}</StatusBadge>
        </EventRow>
      );
    }
    const status = (event.maintenanceStatus ?? "SCHEDULED") as MaintenanceStatus;
    const window = event.scheduledStart ? `${date(event.scheduledStart)}${event.scheduledEnd ? ` – ${date(event.scheduledEnd)}` : ""}` : "Time to be decided";
    return (
      <EventRow key={event.id} href={eventHref(event)} icon={Wrench} title={event.name} meta={`${pagePrefix(event.pageId)}Maintenance · ${window}`}>
        <StatusBadge tone={maintenanceStatusTone(status)}>{MAINTENANCE_STATUS_LABEL[status]}</StatusBadge>
      </EventRow>
    );
  };

  const query = filteredPageId ? `?pageId=${filteredPageId}` : "";
  const createActions = canManage && (
    <div className="flex flex-wrap gap-2">
      <Link href={`/organization/incidents/new${query}`} className={buttonVariants({ size: "sm" })}>
        <Plus aria-hidden size={14} />
        Report incident
      </Link>
      <Link href={`/organization/maintenance/new${query}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
        <CalendarClock aria-hidden size={14} />
        Schedule maintenance
      </Link>
    </div>
  );

  const toolbar = (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
      <nav aria-label="Filter by kind" className="flex gap-1">
        {EVENT_KINDS.map((option) => (
          <Link
            key={option.key}
            href={eventsHref({ pageId: filteredPageId, kind: option.key })}
            aria-current={kind === option.key ? "page" : undefined}
            className={buttonVariants({ variant: kind === option.key ? "secondary" : "ghost", size: "sm" })}
          >
            {option.label}
          </Link>
        ))}
      </nav>
      {createActions}
    </div>
  );

  // A filter must never hide something that is happening right now or coming up.
  const hiddenNotice = hidden.length > 0 && (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-card border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-warn-fg">
      <span>
        {hidden.length} open {kind === "incidents" ? `maintenance window${hidden.length === 1 ? "" : "s"}` : `incident${hidden.length === 1 ? "" : "s"}`} hidden by this filter.
      </span>
      <Link href={eventsHref({ pageId: filteredPageId })} className="rounded-chip font-semibold underline outline-none focus-visible:ring-4 focus-visible:ring-primary/25">Show all</Link>
    </p>
  );

  if (!openEvents.length && !history.length && historyPage === 1) {
    return (
      <div className="space-y-6">
        {kind !== "all" && toolbar}
        <EmptyState
          icon={Siren}
          hue="amber"
          title={kind === "incidents" ? "No incidents yet" : kind === "maintenance" ? "No maintenance yet" : "No incidents or maintenance yet"}
          description="Everything you report or schedule shows up here: what is happening now, what is coming up, and what already happened."
          action={createActions || undefined}
          className="py-20"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toolbar}
      {hiddenNotice}

      {historyPage === 1 && (
        <>
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
        </>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2"><History aria-hidden size={16} className="text-ink-dim" />History</CardTitle>
            <CardDescription>Resolved incidents and completed maintenance, newest first.</CardDescription>
          </div>
          {historyPage > 1 && <Badge>Page {historyPage}</Badge>}
        </CardHeader>
        <CardContent className="py-2">
          {history.length ? <ul className="divide-y divide-line">{history.map(row)}</ul> : <p className="py-3 text-sm text-ink-dim">Nothing here yet.</p>}
        </CardContent>
        {(historyPage > 1 || hasOlder) && (
          <nav aria-label="History pages" className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
            {historyPage > 1
              ? <Link href={eventsHref({ pageId: filteredPageId, kind, historyPage: historyPage - 1 })} className={buttonVariants({ variant: "ghost", size: "sm" })}><ChevronLeft aria-hidden size={14} />Newer</Link>
              : <span />}
            {hasOlder && <Link href={eventsHref({ pageId: filteredPageId, kind, historyPage: historyPage + 1 })} className={buttonVariants({ variant: "ghost", size: "sm" })}>Older<ChevronRight aria-hidden size={14} /></Link>}
          </nav>
        )}
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

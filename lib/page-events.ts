/** Incidents and maintenance windows share the incidents table; these helpers treat them as one stream of page events. */

import type { ExpressionBuilder } from "kysely";
import type { SignalHubDatabase } from "@/lib/postgres/schema";

type PageEvent = {
  id: string;
  isMaintenance: boolean;
  status: string;
  maintenanceStatus: string | null;
  scheduledStart: Date | null;
  createdAt: Date;
};

/** Canonical admin detail URL for either kind. */
export function eventHref(event: { id: string }) {
  return `/organization/events/${event.id}`;
}

/** SQL twin of groupPageEvents: true for active and upcoming events, false for history. */
export function isOpenEvent(eb: ExpressionBuilder<SignalHubDatabase, "incidents">) {
  return eb.or([
    eb.and([eb("isMaintenance", "=", false), eb("status", "!=", "RESOLVED")]),
    eb.and([eb("isMaintenance", "=", true), eb.or([eb("maintenanceStatus", "is", null), eb("maintenanceStatus", "in", ["SCHEDULED", "IN_PROGRESS", "VERIFYING"])])]),
  ]);
}

/**
 * Splits a page's events by urgency: active (open incidents, running maintenance),
 * upcoming (scheduled maintenance, soonest first) and history (newest first).
 */
export function groupPageEvents<T extends PageEvent>(events: T[]) {
  const active: T[] = [];
  const upcoming: T[] = [];
  const history: T[] = [];
  for (const event of events) {
    if (!event.isMaintenance) (event.status === "RESOLVED" ? history : active).push(event);
    else if (event.maintenanceStatus === "IN_PROGRESS" || event.maintenanceStatus === "VERIFYING") active.push(event);
    else if ((event.maintenanceStatus ?? "SCHEDULED") === "SCHEDULED") upcoming.push(event);
    else history.push(event);
  }
  const when = (event: T) => (event.isMaintenance && event.scheduledStart ? event.scheduledStart : event.createdAt).getTime();
  const newestFirst = (a: T, b: T) => when(b) - when(a);
  active.sort(newestFirst);
  history.sort(newestFirst);
  upcoming.sort((a, b) => when(a) - when(b));
  return { active, upcoming, history };
}

export const EVENT_KINDS = [
  { key: "all", label: "All" },
  { key: "incidents", label: "Incidents" },
  { key: "maintenance", label: "Maintenance" },
] as const;
export type EventKind = (typeof EVENT_KINDS)[number]["key"];

export function parseEventKind(value: string | undefined): EventKind {
  return EVENT_KINDS.find((kind) => kind.key === value)?.key ?? "all";
}

/** Inbox URL with the current filters; anything left out is dropped. */
export function eventsHref({ pageId, kind, historyPage }: { pageId?: string; kind?: EventKind; historyPage?: number }) {
  const params = new URLSearchParams();
  if (pageId) params.set("pageId", pageId);
  if (kind && kind !== "all") params.set("show", kind);
  if (historyPage && historyPage > 1) params.set("history", String(historyPage));
  const query = params.toString();
  return query ? `/organization/events?${query}` : "/organization/events";
}

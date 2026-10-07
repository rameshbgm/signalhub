/** Incidents and maintenance windows share the incidents table; these helpers treat them as one stream of page events. */

type PageEvent = {
  id: string;
  isMaintenance: boolean;
  status: string;
  maintenanceStatus: string | null;
  scheduledStart: Date | null;
  createdAt: Date;
};

/** Canonical admin URL, so maintenance detail sits under Maintenance in the sidebar. */
export function eventHref(event: { id: string; isMaintenance: boolean }) {
  return `/organization/${event.isMaintenance ? "maintenance" : "incidents"}/${event.id}`;
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

import { database } from "@/lib/postgres/client";
import { isDatabaseId } from "@/lib/database-id";
import { overallBanner, type ComponentStatus } from "@/lib/status";

export async function getComponentsForPage(pageId: string, visibleIds: string[] | null) {
  const safeVisibleIds = visibleIds?.filter(isDatabaseId) ?? null;
  let componentQuery = database
    .selectFrom("components")
    .selectAll()
    .where("pageId", "=", pageId)
    .where("visible", "=", true);
  if (safeVisibleIds !== null) {
    if (safeVisibleIds.length) componentQuery = componentQuery.where("id", "in", safeVisibleIds);
  }

  const componentRows = safeVisibleIds !== null && safeVisibleIds.length === 0
    ? Promise.resolve([])
    : componentQuery.orderBy("order", "asc").execute();

  const [groups, allVisibleRows] = await Promise.all([
    database
      .selectFrom("componentGroups")
      .selectAll()
      .where("pageId", "=", pageId)
      .orderBy("order", "asc")
      .execute(),
    componentRows,
  ]);
  const componentIds = allVisibleRows.map((component) => component.id);
  const statusEvents = componentIds.length
    ? await database
        .selectFrom("componentStatusEvents")
        .selectAll()
        .where("componentId", "in", componentIds)
        .orderBy("startedAt", "asc")
        .execute()
    : [];
  const statusEventsByComponent = new Map<string, typeof statusEvents>();
  for (const event of statusEvents) {
    const existing = statusEventsByComponent.get(event.componentId) ?? [];
    existing.push(event);
    statusEventsByComponent.set(event.componentId, existing);
  }

  const allVisible = allVisibleRows.map((component) => ({
    ...component,
    statusEvents: statusEventsByComponent.get(component.id) ?? [],
  }));
  const ungrouped = allVisible.filter((component) => !component.groupId);
  const grouped = groups.map((group) => ({
    ...group,
    components: allVisible.filter((component) => component.groupId === group.id),
  }));
  const banner = overallBanner(allVisible.map((component) => component.status as ComponentStatus));

  return {
    groups: grouped.filter((group) => group.components.length > 0),
    ungrouped,
    allVisible,
    banner,
  };
}

const PUBLIC_INCIDENT_LIMIT = 500;

export async function getIncidentsForPage(pageId: string, componentIds?: string[] | null) {
  const scopedIds = componentIds?.filter(isDatabaseId) ?? componentIds;
  let incidentQuery = database
    .selectFrom("incidents")
    .selectAll()
    .where("pageId", "=", pageId);
  if (scopedIds !== null && scopedIds !== undefined) {
    incidentQuery = scopedIds.length
      ? incidentQuery.where((expression) => expression.or([
          expression("pageWide", "=", true),
          expression.exists(
            expression
              .selectFrom("incidentComponents as scopedLink")
              .select("scopedLink.id")
              .whereRef("scopedLink.incidentId", "=", "incidents.id")
              .where("scopedLink.componentId", "in", scopedIds)
          ),
        ]))
      : incidentQuery.where("pageWide", "=", true);
  }
  // ponytail: fixed cap keeps public renders bounded; paginate history if pages exceed it.
  const incidents = await incidentQuery.orderBy("createdAt", "desc").limit(PUBLIC_INCIDENT_LIMIT).execute();
  const incidentIds = incidents.map((incident) => incident.id);
  const [updates, links] = incidentIds.length
    ? await Promise.all([
        database
          .selectFrom("incidentUpdates")
          .selectAll()
          .where("incidentId", "in", incidentIds)
          .orderBy("createdAt", "asc")
          .execute(),
        database
          .selectFrom("incidentComponents")
          .selectAll()
          .where("incidentId", "in", incidentIds)
          .execute(),
      ])
    : [[], []];
  const visibleLinks = scopedIds
    ? links.filter((link) => scopedIds.includes(link.componentId))
    : links;
  const linkedComponentIds = Array.from(new Set(visibleLinks.map((link) => link.componentId)));
  const components = linkedComponentIds.length
    ? await database
        .selectFrom("components")
        .selectAll()
        .where("id", "in", linkedComponentIds)
        .where("pageId", "=", pageId)
        // Public surfaces only: hidden components must never be named.
        .where("visible", "=", true)
        .execute()
    : [];
  const componentById = new Map(components.map((component) => [component.id, component]));

  const updatesByIncident = new Map<string, typeof updates>();
  for (const update of updates) {
    const existing = updatesByIncident.get(update.incidentId) ?? [];
    existing.push(update);
    updatesByIncident.set(update.incidentId, existing);
  }
  const linksByIncident = new Map<string, typeof visibleLinks>();
  for (const link of visibleLinks) {
    const existing = linksByIncident.get(link.incidentId) ?? [];
    existing.push(link);
    linksByIncident.set(link.incidentId, existing);
  }

  return incidents.map((incident) => ({
    ...incident,
    updates: updatesByIncident.get(incident.id) ?? [],
    components: (linksByIncident.get(incident.id) ?? []).flatMap((link) => {
      const component = componentById.get(link.componentId);
      return component ? [{ ...link, component }] : [];
    }),
  }));
}

export async function isIncidentVisibleToScope(
  incidentId: string,
  pageId: string,
  visibleComponentIds: string[] | null
) {
  const incident = await database
    .selectFrom("incidents")
    .select(["id", "pageWide"])
    .where("id", "=", incidentId)
    .where("pageId", "=", pageId)
    .executeTakeFirst();
  if (!incident) return false;
  if (visibleComponentIds === null || incident.pageWide) return true;
  const scopedIds = visibleComponentIds.filter(isDatabaseId);
  if (!scopedIds.length) return false;
  const link = await database
    .selectFrom("incidentComponents")
    .select("id")
    .where("incidentId", "=", incident.id)
    .where("componentId", "in", scopedIds)
    .executeTakeFirst();
  return Boolean(link);
}

/** Visible metrics for a page. Chart data is loaded separately by getMetricInsights (lib/metric-series.ts). */
export async function getMetricsForPage(
  pageId: string,
  visibleComponentIds: string[] | null
) {
  const scopedIds = visibleComponentIds?.filter(isDatabaseId) ?? null;
  if (scopedIds !== null && scopedIds.length === 0) return [];
  let metricQuery = database
    .selectFrom("metrics")
    .selectAll()
    .where("pageId", "=", pageId)
    .where("visible", "=", true);
  if (scopedIds !== null) {
    metricQuery = metricQuery.where("componentId", "in", scopedIds);
  }
  return metricQuery.execute();
}

export function splitActiveAndPast(incidents: Awaited<ReturnType<typeof getIncidentsForPage>>) {
  const active = incidents.filter((incident) => {
    if (incident.isMaintenance) {
      return incident.maintenanceStatus === "IN_PROGRESS" || incident.maintenanceStatus === "VERIFYING";
    }
    return incident.status !== "RESOLVED";
  });
  const past = incidents.filter(
    (incident) =>
      !active.includes(incident) &&
      (!incident.isMaintenance || incident.maintenanceStatus === "COMPLETED")
  );
  return { active, past };
}

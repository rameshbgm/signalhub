import type { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { isValidOid, oid, toId } from "@/lib/mongo-utils";
import { overallBanner, type ComponentStatus } from "@/lib/status";

export async function getPageBySlug(slug: string) {
  const pageDoc = await collections.pages().findOne({ slug });
  if (!pageDoc) return null;

  const [hubChildrenDocs, hubParentDoc] = await Promise.all([
    pageDoc.isHub
      ? collections.pages().find({ hubParentId: pageDoc._id }).sort({ createdAt: 1 }).toArray()
      : Promise.resolve([]),
    pageDoc.hubParentId ? collections.pages().findOne({ _id: pageDoc.hubParentId }) : Promise.resolve(null),
  ]);

  return {
    ...toId(pageDoc),
    hubChildren: hubChildrenDocs.map(toId),
    hubParent: hubParentDoc ? toId(hubParentDoc) : null,
  };
}

export async function getComponentsForPage(pageId: string, visibleIds: string[] | null) {
  const pid = oid(pageId);
  const safeVisibleIds = visibleIds?.filter(isValidOid) ?? null;
  const idFilter = safeVisibleIds ? { _id: { $in: safeVisibleIds.map(oid) } } : {};

  const [groupDocs, allVisibleDocs] = await Promise.all([
    collections.componentGroups().find({ pageId: pid }).sort({ order: 1 }).toArray(),
    collections.components().find({ pageId: pid, visible: true, ...idFilter }).toArray(),
  ]);

  const componentIds = allVisibleDocs.map((c) => c._id);
  const statusEventDocs = componentIds.length
    ? await collections.componentStatusEvents().find({ componentId: { $in: componentIds } }).toArray()
    : [];
  const statusEventsByComponent = new Map<string, typeof statusEventDocs>();
  for (const ev of statusEventDocs) {
    const key = ev.componentId.toHexString();
    if (!statusEventsByComponent.has(key)) statusEventsByComponent.set(key, []);
    statusEventsByComponent.get(key)!.push(ev);
  }

  const allVisible = allVisibleDocs
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((c) => ({
      ...toId(c),
      statusEvents: (statusEventsByComponent.get(c._id.toHexString()) ?? []).map(toId),
    }));

  const ungrouped = allVisible.filter((c) => !c.groupId);

  const groups = groupDocs.map((g) => ({
    ...toId(g),
    components: allVisible.filter((c) => c.groupId === g._id.toHexString()),
  }));

  const banner = overallBanner(allVisible.map((c) => c.status as ComponentStatus));

  return { groups: groups.filter((g) => g.components.length > 0), ungrouped, allVisible, banner };
}

export async function getIncidentsForPage(pageId: string, componentIds?: string[] | null) {
  const pid = oid(pageId);
  const scopedIds = componentIds?.filter(isValidOid) ?? componentIds;

  let incidentIdFilter:
    | { $or: ({ pageWide: true } | { _id: { $in: ObjectId[] } })[] }
    | Record<string, never> = {};
  if (scopedIds) {
    const links = await collections
      .incidentComponents()
      .find({ componentId: { $in: scopedIds.map(oid) } })
      .toArray();
    const incidentIds = Array.from(new Set(links.map((l) => l.incidentId.toHexString()))).map(oid);
    incidentIdFilter = { $or: [{ pageWide: true }, { _id: { $in: incidentIds } }] };
  }

  const incidentDocs = await collections
    .incidents()
    .find({ pageId: pid, ...incidentIdFilter })
    .sort({ createdAt: -1 })
    .toArray();

  const incidentIds = incidentDocs.map((i) => i._id);
  const [updateDocs, linkDocs] = await Promise.all([
    incidentIds.length
      ? collections.incidentUpdates().find({ incidentId: { $in: incidentIds } }).sort({ createdAt: 1 }).toArray()
      : Promise.resolve([]),
    incidentIds.length
      ? collections.incidentComponents().find({ incidentId: { $in: incidentIds } }).toArray()
      : Promise.resolve([]),
  ]);

  const visibleLinkDocs = scopedIds
    ? linkDocs.filter((link) => scopedIds.includes(link.componentId.toHexString()))
    : linkDocs;
  const linkedComponentIds = Array.from(
    new Set(visibleLinkDocs.map((l) => l.componentId.toHexString()))
  ).map(oid);
  const componentDocs = linkedComponentIds.length
    ? await collections.components().find({ _id: { $in: linkedComponentIds }, pageId: pid }).toArray()
    : [];
  const componentById = new Map(componentDocs.map((c) => [c._id.toHexString(), toId(c)]));

  const updatesByIncident = new Map<string, typeof updateDocs>();
  for (const u of updateDocs) {
    const key = u.incidentId.toHexString();
    if (!updatesByIncident.has(key)) updatesByIncident.set(key, []);
    updatesByIncident.get(key)!.push(u);
  }
  const linksByIncident = new Map<string, typeof linkDocs>();
  for (const l of visibleLinkDocs) {
    const key = l.incidentId.toHexString();
    if (!linksByIncident.has(key)) linksByIncident.set(key, []);
    linksByIncident.get(key)!.push(l);
  }

  const incidents = incidentDocs.map((inc) => ({
    ...toId(inc),
    updates: (updatesByIncident.get(inc._id.toHexString()) ?? []).map(toId),
    components: (linksByIncident.get(inc._id.toHexString()) ?? []).map((l) => ({
      ...toId(l),
      component: componentById.get(l.componentId.toHexString())!,
    })),
  }));

  return incidents;
}

export async function isIncidentVisibleToScope(
  incidentId: string,
  pageId: string,
  visibleComponentIds: string[] | null
) {
  const incident = await collections.incidents().findOne({
    _id: oid(incidentId),
    pageId: oid(pageId),
  });
  if (!incident) return false;
  if (visibleComponentIds === null || incident.pageWide) return true;
  if (!visibleComponentIds.length) return false;
  return Boolean(
    await collections.incidentComponents().findOne({
      incidentId: incident._id,
      componentId: { $in: visibleComponentIds.filter(isValidOid).map(oid) },
    })
  );
}

export async function getMetricsForPage(
  pageId: string,
  visibleComponentIds: string[] | null,
  pointLimit = 200
) {
  const pid = oid(pageId);
  const scope =
    visibleComponentIds === null
      ? {}
      : {
          // Audience access is strictly component-scoped.  Unlike incidents,
          // metrics do not have an explicit page-wide flag, so a metric with no
          // component must never be implicitly exposed to an audience viewer.
          componentId: {
            $in: visibleComponentIds.filter(isValidOid).map(oid),
          },
        };
  const metricDocs = await collections
    .metrics()
    .find({ pageId: pid, visible: true, ...scope })
    .toArray();
  const pointsByMetric = await Promise.all(
    metricDocs.map(async (metric) => {
      const newestFirst = await collections
        .metricPoints()
        .find({ metricId: metric._id })
        .sort({ timestamp: -1 })
        .limit(pointLimit)
        .toArray();
      return newestFirst.reverse();
    })
  );
  return metricDocs.map((metric, index) => ({
    ...toId(metric),
    points: pointsByMetric[index].map(toId),
  }));
}

export function splitActiveAndPast(incidents: Awaited<ReturnType<typeof getIncidentsForPage>>) {
  const active = incidents.filter((i) => {
    if (i.isMaintenance) {
      return i.maintenanceStatus === "IN_PROGRESS" || i.maintenanceStatus === "VERIFYING";
    }
    return i.status !== "RESOLVED";
  });
  const past = incidents.filter(
    (incident) =>
      !active.includes(incident) &&
      (!incident.isMaintenance || incident.maintenanceStatus === "COMPLETED")
  );
  return { active, past };
}

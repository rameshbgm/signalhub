import { ObjectId, type ClientSession } from "mongodb";
import { collections, mongoClient } from "@/lib/db";
import {
  COMPONENT_STATUSES,
  type ComponentStatus,
  worstStatus,
} from "@/lib/status";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { activePageFilter } from "@/lib/page-lifecycle";

type ReconciliationSources = {
  manualStatus: ComponentStatus;
  incidentStatuses: ComponentStatus[];
  maintenanceActive: boolean;
  monitorStatuses: ComponentStatus[];
};

function calculateReconciledStatus(sources: ReconciliationSources) {
  const candidates: ComponentStatus[] = [
    sources.manualStatus,
    ...sources.incidentStatuses,
    ...sources.monitorStatuses,
    ...(sources.maintenanceActive ? (["UNDER_MAINTENANCE"] as ComponentStatus[]) : []),
  ];
  const status = worstStatus(candidates);
  return {
    status,
    // A maintenance window excludes the interval from uptime calculations
    // even when a more severe outage is simultaneously the displayed status.
    isMaintenance:
      sources.maintenanceActive ||
      (status === "UNDER_MAINTENANCE" && sources.manualStatus === "UNDER_MAINTENANCE"),
  };
}

async function reconcileInSession(
  componentId: ObjectId,
  session: ClientSession,
  eventContext?: { note?: string | null }
) {
  const component = await collections.components().findOne({ _id: componentId }, { session });
  if (!component) return false;
  const page = await collections.pages().findOne(
    activePageFilter({ _id: component.pageId }),
    { session }
  );
  if (!page) return false;
  await fenceActiveOrganizationMutation(page.orgId, session);

  const links = await collections.incidentComponents().find({ componentId }, { session }).toArray();
  const incidentIds = links.map((link) => link.incidentId);
  const incidents = incidentIds.length
    ? await collections
        .incidents()
        .find({ _id: { $in: incidentIds } }, { session })
        .toArray()
    : [];
  const incidentById = new Map(incidents.map((incident) => [incident._id.toHexString(), incident]));
  const incidentStatuses: ComponentStatus[] = [];
  let maintenanceActive = false;
  for (const link of links) {
    const incident = incidentById.get(link.incidentId.toHexString());
    if (!incident) continue;
    if (incident.isMaintenance) {
      if (incident.maintenanceStatus === "IN_PROGRESS" || incident.maintenanceStatus === "VERIFYING") {
        maintenanceActive = true;
      }
    } else if (incident.status !== "RESOLVED" && COMPONENT_STATUSES.includes(link.newStatus as ComponentStatus)) {
      incidentStatuses.push(link.newStatus as ComponentStatus);
    }
  }

  const monitors = await collections
    .monitors()
    .find({ componentId, enabled: true, actionFlipStatus: true }, { session })
    .toArray();
  const monitorStatuses = monitors
    .filter((monitor) => monitor.isDown)
    .map((monitor) => monitor.downStatus)
    .filter((status): status is ComponentStatus =>
      COMPONENT_STATUSES.includes(status as ComponentStatus)
    );

  const manualStatus = COMPONENT_STATUSES.includes(component.manualStatus as ComponentStatus)
    ? (component.manualStatus as ComponentStatus)
    : "OPERATIONAL";
  const reconciled = calculateReconciledStatus({
    manualStatus,
    incidentStatuses,
    maintenanceActive,
    monitorStatuses,
  });

  const openEvent = await collections
    .componentStatusEvents()
    .findOne({ componentId, endedAt: null }, { session, sort: { startedAt: -1 } });
  if (component.status === reconciled.status && openEvent?.status === reconciled.status) return false;

  const now = new Date();
  await collections
    .componentStatusEvents()
    .updateMany({ componentId, endedAt: null }, { $set: { endedAt: now } }, { session });
  await collections.componentStatusEvents().insertOne(
    {
      _id: new ObjectId(),
      componentId,
      status: reconciled.status,
      startedAt: now,
      endedAt: null,
      isMaintenance: reconciled.isMaintenance,
      note: eventContext?.note?.trim() || null,
    },
    { session }
  );
  await collections
    .components()
    .updateOne({ _id: componentId }, { $set: { status: reconciled.status } }, { session });
  return true;
}

export async function reconcileComponentStatus(componentId: ObjectId, session?: ClientSession) {
  if (session) return reconcileInSession(componentId, session);
  const ownSession = mongoClient.startSession();
  try {
    let changed = false;
    await ownSession.withTransaction(async () => {
      changed = await reconcileInSession(componentId, ownSession);
    });
    return changed;
  } finally {
    await ownSession.endSession();
  }
}

export async function reconcileComponents(
  componentIds: Iterable<ObjectId>,
  session?: ClientSession
) {
  const unique = [
    ...new Map(Array.from(componentIds, (id) => [id.toHexString(), id])).values(),
  ];
  for (const componentId of unique) {
    await reconcileComponentStatus(componentId, session);
  }
}

/**
 * Sets the manual override source and then reconciles the effective status
 * against active incidents, maintenance, and monitors.
 */
export async function setComponentStatus(
  componentId: ObjectId,
  status: string,
  options?: { isMaintenance?: boolean; note?: string | null }
) {
  if (!COMPONENT_STATUSES.includes(status as ComponentStatus)) {
    throw new Error("Invalid component status");
  }
  const session = mongoClient.startSession();
  try {
    let changed = false;
    await session.withTransaction(async () => {
      const component = await collections.components().findOne(
        { _id: componentId },
        { session }
      );
      const page = component
        ? await collections.pages().findOne(
            { _id: component.pageId },
            { session }
          )
        : null;
      if (!component || !page) return;
      await fenceActiveOrganizationMutation(page.orgId, session);
      const result = await collections.components().updateOne(
        { _id: componentId, pageId: page._id },
        { $set: { manualStatus: status } },
        { session }
      );
      if (!result.matchedCount) return;
      changed = await reconcileInSession(componentId, session, { note: options?.note });
      const note = options?.note?.trim();
      if (!changed && note) {
        const openEvent = await collections.componentStatusEvents().findOne(
          { componentId, endedAt: null },
          { session, sort: { startedAt: -1 } }
        );
        if (openEvent) {
          await collections.componentStatusEvents().updateOne(
            { _id: openEvent._id, componentId },
            { $set: { note: openEvent.note ? `${openEvent.note}\n${note}` : note } },
            { session }
          );
        }
      }
    });
    return changed;
  } finally {
    await session.endSession();
  }
}

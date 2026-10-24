import { withDatabaseTransaction, type DatabaseTransaction } from "@/lib/postgres/client";
import {
  COMPONENT_STATUSES,
  type ComponentStatus,
  worstStatus,
} from "@/lib/status";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";

type Identifier = string | { toHexString(): string };

function idString(id: Identifier) {
  return typeof id === "string" ? id : id.toHexString();
}

function postgresTransaction(candidate?: object): DatabaseTransaction | null {
  return candidate && "selectFrom" in candidate ? candidate as DatabaseTransaction : null;
}

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
    ...(sources.maintenanceActive ? ["UNDER_MAINTENANCE" as ComponentStatus] : []),
  ];
  const status = worstStatus(candidates);
  return {
    status,
    isMaintenance:
      sources.maintenanceActive ||
      (status === "UNDER_MAINTENANCE" && sources.manualStatus === "UNDER_MAINTENANCE"),
  };
}

async function reconcileInTransaction(
  componentId: string,
  transaction: DatabaseTransaction,
  eventContext?: { note?: string | null }
) {
  const component = await transaction
    .selectFrom("components")
    .innerJoin("pages", "pages.id", "components.pageId")
    .select([
      "components.id",
      "components.status",
      "components.manualStatus",
      "pages.orgId",
    ])
    .where("components.id", "=", componentId)
    .where("pages.deletedAt", "is", null)
    .forUpdate("components")
    .executeTakeFirst();
  if (!component) return false;
  await fenceActiveOrganizationMutation(component.orgId, transaction);

  const incidentSources = await transaction
    .selectFrom("incidentComponents as link")
    .innerJoin("incidents as incident", "incident.id", "link.incidentId")
    .select([
      "link.newStatus",
      "incident.isMaintenance",
      "incident.maintenanceStatus",
      "incident.status",
    ])
    .where("link.componentId", "=", componentId)
    .execute();
  const incidentStatuses: ComponentStatus[] = [];
  let maintenanceActive = false;
  for (const source of incidentSources) {
    if (source.isMaintenance) {
      if (["IN_PROGRESS", "VERIFYING"].includes(source.maintenanceStatus ?? "")) {
        maintenanceActive = true;
      }
    } else if (
      source.status !== "RESOLVED" &&
      COMPONENT_STATUSES.includes(source.newStatus as ComponentStatus)
    ) {
      incidentStatuses.push(source.newStatus as ComponentStatus);
    }
  }

  const monitors = await transaction
    .selectFrom("monitors")
    .select(["isDown", "downStatus"])
    .where("componentId", "=", componentId)
    .where("enabled", "=", true)
    .where("actionFlipStatus", "=", true)
    .execute();
  const monitorStatuses = monitors
    .filter((monitor) => monitor.isDown)
    .map((monitor) => monitor.downStatus)
    .filter((status): status is ComponentStatus =>
      COMPONENT_STATUSES.includes(status as ComponentStatus)
    );
  const manualStatus = COMPONENT_STATUSES.includes(component.manualStatus as ComponentStatus)
    ? component.manualStatus as ComponentStatus
    : "OPERATIONAL";
  const reconciled = calculateReconciledStatus({
    manualStatus,
    incidentStatuses,
    maintenanceActive,
    monitorStatuses,
  });
  const openEvent = await transaction
    .selectFrom("componentStatusEvents")
    .select(["id", "status", "note"])
    .where("componentId", "=", componentId)
    .where("endedAt", "is", null)
    .orderBy("startedAt", "desc")
    .forUpdate()
    .executeTakeFirst();
  if (component.status === reconciled.status && openEvent?.status === reconciled.status) return false;

  const now = new Date();
  await transaction
    .updateTable("componentStatusEvents")
    .set({ endedAt: now })
    .where("componentId", "=", componentId)
    .where("endedAt", "is", null)
    .execute();
  await transaction.insertInto("componentStatusEvents").values({
    componentId,
    status: reconciled.status,
    startedAt: now,
    endedAt: null,
    isMaintenance: reconciled.isMaintenance,
    note: eventContext?.note?.trim() || null,
  }).execute();
  await transaction
    .updateTable("components")
    .set({ status: reconciled.status })
    .where("id", "=", componentId)
    .execute();
  return true;
}

export async function reconcileComponentStatus(componentId: Identifier, candidate?: object) {
  const id = idString(componentId);
  const transaction = postgresTransaction(candidate);
  return transaction
    ? reconcileInTransaction(id, transaction)
    : withDatabaseTransaction((ownTransaction) => reconcileInTransaction(id, ownTransaction));
}

export async function reconcileComponents(componentIds: Iterable<Identifier>, candidate?: object) {
  const unique = Array.from(new Set(Array.from(componentIds, idString)));
  const transaction = postgresTransaction(candidate);
  if (transaction) {
    for (const componentId of unique) await reconcileInTransaction(componentId, transaction);
    return;
  }
  await withDatabaseTransaction(async (ownTransaction) => {
    for (const componentId of unique) await reconcileInTransaction(componentId, ownTransaction);
  });
}

export async function setComponentStatus(
  componentId: Identifier,
  status: string,
  options?: { isMaintenance?: boolean; note?: string | null }
) {
  if (!COMPONENT_STATUSES.includes(status as ComponentStatus)) {
    throw new Error("Invalid component status");
  }
  const id = idString(componentId);
  return withDatabaseTransaction(async (transaction) => {
    const component = await transaction
      .selectFrom("components")
      .innerJoin("pages", "pages.id", "components.pageId")
      .select(["components.id", "pages.orgId"])
      .where("components.id", "=", id)
      .forUpdate("components")
      .executeTakeFirst();
    if (!component) return false;
    await fenceActiveOrganizationMutation(component.orgId, transaction);
    await transaction
      .updateTable("components")
      .set({ manualStatus: status })
      .where("id", "=", id)
      .execute();
    const changed = await reconcileInTransaction(id, transaction, { note: options?.note });
    const note = options?.note?.trim();
    if (!changed && note) {
      const openEvent = await transaction
        .selectFrom("componentStatusEvents")
        .select(["id", "note"])
        .where("componentId", "=", id)
        .where("endedAt", "is", null)
        .orderBy("startedAt", "desc")
        .forUpdate()
        .executeTakeFirst();
      if (openEvent) {
        await transaction
          .updateTable("componentStatusEvents")
          .set({ note: openEvent.note ? `${openEvent.note}\n${note}` : note })
          .where("id", "=", openEvent.id)
          .execute();
      }
    }
    return changed;
  });
}

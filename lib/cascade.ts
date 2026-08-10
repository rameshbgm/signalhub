import { assetStorageForDriver } from "@/lib/asset-storage";
import {
  database,
  withDatabaseTransaction,
  type DatabaseTransaction,
} from "@/lib/postgres/client";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";

export type OrganizationPurgeScope = {
  pageIds: string[];
  componentIds: string[];
  incidentIds: string[];
  metricIds: string[];
  monitorIds: string[];
};

function emptyScope(): OrganizationPurgeScope {
  return { pageIds: [], componentIds: [], incidentIds: [], metricIds: [], monitorIds: [] };
}

function normalizeScope(value: unknown): OrganizationPurgeScope {
  if (!value || typeof value !== "object") return emptyScope();
  const candidate = value as Partial<Record<keyof OrganizationPurgeScope, unknown>>;
  const strings = (items: unknown) =>
    Array.isArray(items) ? items.filter((item): item is string => typeof item === "string") : [];
  return {
    pageIds: strings(candidate.pageIds),
    componentIds: strings(candidate.componentIds),
    incidentIds: strings(candidate.incidentIds),
    metricIds: strings(candidate.metricIds),
    monitorIds: strings(candidate.monitorIds),
  };
}

function mergeIds(existing: string[], rows: Array<{ id: string }>) {
  return [...new Set([...existing, ...rows.map((row) => row.id)])];
}

async function deleteRecordedAssets(rows: Array<{ storageDriver: "LOCAL" | "S3"; storageKey: string }>) {
  for (const asset of rows) {
    await assetStorageForDriver(asset.storageDriver).delete(asset.storageKey);
  }
}

export function withTransaction<T>(operation: (transaction: DatabaseTransaction) => Promise<T>) {
  return withDatabaseTransaction(operation);
}

export async function deletePageCascade(pageId: string, organizationId: string) {
  const assets = await database.selectFrom("assets")
    .select(["storageDriver", "storageKey"])
    .where("pageId", "=", pageId)
    .where("orgId", "=", organizationId)
    .execute();
  await deleteRecordedAssets(assets);

  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(organizationId, transaction);
    const removed = await transaction.deleteFrom("pages")
      .where("id", "=", pageId)
      .where("orgId", "=", organizationId)
      .returning("id")
      .executeTakeFirst();
    if (!removed) throw new Error("Page not found in your organization");
  });
  return true;
}

export async function deleteIncidentCascade(incidentId: string) {
  await database.deleteFrom("incidents").where("id", "=", incidentId).execute();
}

export async function deleteComponentCascade(
  componentId: string,
  organizationId: string,
  pageId: string
) {
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(organizationId, transaction);
    const page = await transaction.selectFrom("pages")
      .select("id")
      .where("id", "=", pageId)
      .where("orgId", "=", organizationId)
      .executeTakeFirst();
    if (!page) throw new Error("Page not found in your organization");
    const removed = await transaction.deleteFrom("components")
      .where("id", "=", componentId)
      .where("pageId", "=", pageId)
      .returning("id")
      .executeTakeFirst();
    if (!removed) throw new Error("Component not found on this page");
  });
  return true;
}

export async function deleteMetricCascade(
  metricId: string,
  organizationId: string,
  pageId: string
) {
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(organizationId, transaction);
    const removed = await transaction.deleteFrom("metrics")
      .where("id", "=", metricId)
      .where("pageId", "=", pageId)
      .where("pageId", "in", transaction.selectFrom("pages").select("id")
        .where("orgId", "=", organizationId))
      .returning("id").executeTakeFirst();
    if (!removed) throw new Error("Metric not found on this page");
  });
  return true;
}

export async function deleteMonitorCascade(
  monitorId: string,
  organizationId: string,
  pageId: string
) {
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(organizationId, transaction);
    const removed = await transaction.deleteFrom("monitors")
      .where("id", "=", monitorId)
      .where("pageId", "=", pageId)
      .where("pageId", "in", transaction.selectFrom("pages").select("id")
        .where("orgId", "=", organizationId))
      .returning("id").executeTakeFirst();
    if (!removed) throw new Error("Monitor not found on this page");
  });
  return true;
}

type DeleteOrganizationOptions = {
  beforeFinalize?: () => Promise<void>;
  finalize?: (transaction: DatabaseTransaction, scope: OrganizationPurgeScope) => Promise<void>;
  initialScope?: unknown;
  recordScope?: (scope: OrganizationPurgeScope, transaction: DatabaseTransaction) => Promise<void>;
};

export async function deleteOrgCascade(
  organizationId: string,
  options: DeleteOrganizationOptions = {}
) {
  const assets = await database.selectFrom("assets")
    .select(["storageDriver", "storageKey"])
    .where("orgId", "=", organizationId)
    .execute();
  await deleteRecordedAssets(assets);
  await options.beforeFinalize?.();

  return withDatabaseTransaction(async (transaction) => {
    const organization = await transaction.selectFrom("organizations")
      .select("id")
      .where("id", "=", organizationId)
      .forUpdate()
      .executeTakeFirst();
    if (!organization) throw new Error("Organization no longer exists");

    const scope = normalizeScope(options.initialScope);
    const pages = await transaction.selectFrom("pages").select("id")
      .where("orgId", "=", organizationId).execute();
    scope.pageIds = mergeIds(scope.pageIds, pages);
    if (scope.pageIds.length) {
      const [components, incidents, metrics, monitors] = await Promise.all([
        transaction.selectFrom("components").select("id").where("pageId", "in", scope.pageIds).execute(),
        transaction.selectFrom("incidents").select("id").where("pageId", "in", scope.pageIds).execute(),
        transaction.selectFrom("metrics").select("id").where("pageId", "in", scope.pageIds).execute(),
        transaction.selectFrom("monitors").select("id").where("pageId", "in", scope.pageIds).execute(),
      ]);
      scope.componentIds = mergeIds(scope.componentIds, components);
      scope.incidentIds = mergeIds(scope.incidentIds, incidents);
      scope.metricIds = mergeIds(scope.metricIds, metrics);
      scope.monitorIds = mergeIds(scope.monitorIds, monitors);
    }
    await options.recordScope?.(scope, transaction);

    const removed = await transaction.deleteFrom("organizations")
      .where("id", "=", organizationId)
      .returning("id")
      .executeTakeFirst();
    if (!removed) throw new Error("Organization changed before purge");
    await options.finalize?.(transaction, scope);
    return scope;
  });
}

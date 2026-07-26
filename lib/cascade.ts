import type { ClientSession, ObjectId } from "mongodb";
import {
  collections,
  db,
  mongoClient,
  type OrganizationPurgeScopeDoc,
} from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import {
  assetStorageForDriver,
} from "@/lib/asset-storage";
import { fenceActiveOrganizationMutation } from "./organization-mutation";

function recordedAssetStorage(driver: unknown) {
  if (driver !== "LOCAL" && driver !== "S3") {
    throw new Error(
      "Asset storage driver is missing or unsupported; purge stopped before deleting its database record"
    );
  }
  return assetStorageForDriver(driver);
}

export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = mongoClient.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result!;
  } finally {
    await session.endSession();
  }
}

export async function deletePageCascade(
  pageId: string,
  organizationId: string
) {
  const id = oid(pageId);
  await withTransaction(async (session) => {
    await fenceActiveOrganizationMutation(organizationId, session);
    const page = await collections.pages().findOne(
      { _id: id, orgId: oid(organizationId) },
      { session }
    );
    if (!page) throw new Error("Page not found in your organization");
    const assets = await collections
      .assets()
      .find(
        { pageId: page._id },
        {
          session,
          projection: { storageKey: 1, storageDriver: 1 },
        }
      )
      .toArray();
    for (const asset of assets) {
      await recordedAssetStorage(asset.storageDriver).delete(asset.storageKey);
    }
    const componentIds = (
      await collections.components().find({ pageId: id }, { session, projection: { _id: 1 } }).toArray()
    ).map((d) => d._id);
    const incidentIds = (
      await collections.incidents().find({ pageId: id }, { session, projection: { _id: 1 } }).toArray()
    ).map((d) => d._id);
    const metricIds = (
      await collections.metrics().find({ pageId: id }, { session, projection: { _id: 1 } }).toArray()
    ).map((d) => d._id);
    const monitorIds = (
      await collections.monitors().find({ pageId: id }, { session, projection: { _id: 1 } }).toArray()
    ).map((d) => d._id);

    await collections.componentStatusEvents().deleteMany(
      { componentId: { $in: componentIds } },
      { session }
    );
    await collections.incidentComponents().deleteMany(
      { incidentId: { $in: incidentIds } },
      { session }
    );
    await collections.incidentUpdates().deleteMany(
      { incidentId: { $in: incidentIds } },
      { session }
    );
    await collections.metricPoints().deleteMany({ metricId: { $in: metricIds } }, { session });
    await collections.monitorChecks().deleteMany({ monitorId: { $in: monitorIds } }, { session });
    await collections.monitors().deleteMany({ pageId: id }, { session });
    await collections.components().deleteMany({ pageId: id }, { session });
    await collections.incidents().deleteMany({ pageId: id }, { session });
    await collections.metrics().deleteMany({ pageId: id }, { session });
    await collections.componentGroups().deleteMany({ pageId: id }, { session });
    await collections.incidentTemplates().deleteMany({ pageId: id }, { session });
    await collections.templateGroups().deleteMany({ pageId: id }, { session });
    await collections.webhookEndpoints().deleteMany({ pageId: id }, { session });
    await collections.subscribers().deleteMany({ pageId: id }, { session });
    await collections.subscriptionOtps().deleteMany({ pageId: id.toHexString() }, { session });
    await collections.pageAccessUsers().deleteMany({ pageId: id }, { session });
    await collections.pageAccessGroups().deleteMany({ pageId: id }, { session });
    await collections.notificationJobs().deleteMany({ pageId: id }, { session });
    await collections.notificationLogs().deleteMany({ pageId: id.toHexString() }, { session });
    await collections.feedTokens().deleteMany({ pageId: id }, { session });
    await collections.assets().deleteMany({ pageId: id }, { session });
    await collections.notificationDestinations().deleteMany({ pageId: id }, { session });
    await collections.analyticsDaily().deleteMany({ pageId: id }, { session });
    await collections.pageDesignDrafts().deleteMany({ pageId: id }, { session });
    await collections.pageDesignVersions().deleteMany({ pageId: id }, { session });
    await collections.pageAnnouncements().deleteMany({ pageId: id }, { session });

    const removed = await collections.pages().deleteOne(
      { _id: page._id, orgId: page.orgId },
      { session }
    );
    if (!removed.deletedCount) throw new Error("Page changed; reload and retry");
  });
  return true;
}

export async function deleteIncidentCascade(incidentId: string) {
  const id = oid(incidentId);
  await withTransaction(async (session) => {
    await collections.incidentUpdates().deleteMany({ incidentId: id }, { session });
    await collections.incidentComponents().deleteMany({ incidentId: id }, { session });
    await collections.incidents().deleteOne({ _id: id }, { session });
  });
}

export async function deleteComponentCascade(
  componentId: string,
  organizationId: string,
  pageId: string
) {
  const id = oid(componentId);
  await withTransaction(async (session) => {
    await fenceActiveOrganizationMutation(organizationId, session);
    const page = await collections.pages().findOne(
      { _id: oid(pageId), orgId: oid(organizationId) },
      { session }
    );
    if (!page) throw new Error("Page not found in your organization");
    const component = await collections.components().findOne(
      { _id: id, pageId: page._id },
      { session }
    );
    if (!component) throw new Error("Component not found on this page");
    await collections.incidentComponents().deleteMany({ componentId: id }, { session });
    await collections.componentStatusEvents().deleteMany({ componentId: id }, { session });
    await collections
      .monitors()
      .updateMany({ componentId: id }, { $set: { componentId: null } }, { session });
    const removed = await collections.components().deleteOne(
      { _id: component._id, pageId: page._id },
      { session }
    );
    if (!removed.deletedCount) throw new Error("Component changed; reload and retry");
  });
  return true;
}

type OrganizationPurgeFinalize = (
  session: ClientSession,
  scope: OrganizationPurgeScopeDoc
) => Promise<void>;

interface DeleteOrganizationOptions {
  /**
   * Runs after the fixed-point cleanup, immediately before the final
   * transaction. The platform worker uses this to stop its heartbeat and
   * prove that it still owns the purge lease.
   */
  beforeFinalize?: () => Promise<void>;
  /**
   * Runs in the same transaction as the final tenant-data/root deletion.
   * This lets the worker commit its tombstone, terminal job state, and audit
   * record atomically with the database purge.
   */
  finalize?: OrganizationPurgeFinalize;
  /** Scope recovered from the durable purge job after an interrupted attempt. */
  initialScope?: OrganizationPurgeScopeDoc;
  /**
   * Persists newly discovered keys in the same transaction that removes their
   * parent records, keeping retries possible even if legacy data lacks roots.
   */
  recordScope?: (
    scope: OrganizationPurgeScopeDoc,
    session: ClientSession
  ) => Promise<void>;
  /** Primarily useful for deterministic focused tests. */
  settleDelayMs?: number;
}

interface OrganizationPurgeScope {
  pageIds: Map<string, ObjectId>;
  componentIds: Map<string, ObjectId>;
  incidentIds: Map<string, ObjectId>;
  metricIds: Map<string, ObjectId>;
  monitorIds: Map<string, ObjectId>;
}

const PURGE_MAX_SETTLE_PASSES = 20;
const PURGE_REQUIRED_QUIET_PASSES = 2;
const PURGE_SETTLE_DELAY_MILLISECONDS = 25;

function rememberIds(
  destination: Map<string, ObjectId>,
  documents: Array<{ _id: ObjectId }>
) {
  for (const document of documents) {
    destination.set(document._id.toHexString(), document._id);
  }
}

function serializedPurgeScope(
  scope: OrganizationPurgeScope
): OrganizationPurgeScopeDoc {
  return {
    pageIds: [...scope.pageIds.values()],
    componentIds: [...scope.componentIds.values()],
    incidentIds: [...scope.incidentIds.values()],
    metricIds: [...scope.metricIds.values()],
    monitorIds: [...scope.monitorIds.values()],
  };
}

function mutationCount(result: {
  deletedCount?: number;
  modifiedCount?: number;
}) {
  return (result.deletedCount ?? 0) + (result.modifiedCount ?? 0);
}

async function deleteOrganizationDataPass(
  organizationId: ObjectId,
  scope: OrganizationPurgeScope,
  session: ClientSession,
  deleteRoots: boolean,
  recordScope?: DeleteOrganizationOptions["recordScope"]
) {
  const pageDocuments = await collections
    .pages()
    .find(
      { orgId: organizationId },
      { session, projection: { _id: 1 } }
    )
    .toArray();
  rememberIds(scope.pageIds, pageDocuments);
  const pageIds = [...scope.pageIds.values()];

  const componentDocuments = await collections
    .components()
    .find(
      { pageId: { $in: pageIds } },
      { session, projection: { _id: 1 } }
    )
    .toArray();
  rememberIds(scope.componentIds, componentDocuments);
  const incidentDocuments = await collections
    .incidents()
    .find(
      { pageId: { $in: pageIds } },
      { session, projection: { _id: 1 } }
    )
    .toArray();
  rememberIds(scope.incidentIds, incidentDocuments);
  const metricDocuments = await collections
    .metrics()
    .find(
      { pageId: { $in: pageIds } },
      { session, projection: { _id: 1 } }
    )
    .toArray();
  rememberIds(scope.metricIds, metricDocuments);
  const monitorDocuments = await collections
    .monitors()
    .find(
      { pageId: { $in: pageIds } },
      { session, projection: { _id: 1 } }
    )
    .toArray();
  rememberIds(scope.monitorIds, monitorDocuments);
  await recordScope?.(serializedPurgeScope(scope), session);

  const componentIds = [...scope.componentIds.values()];
  const incidentIds = [...scope.incidentIds.values()];
  const metricIds = [...scope.metricIds.values()];
  const monitorIds = [...scope.monitorIds.values()];
  const pageIdStrings = pageIds.map((pageId) => pageId.toHexString());
  let changes = 0;

  changes += mutationCount(
    await collections
      .componentStatusEvents()
      .deleteMany({ componentId: { $in: componentIds } }, { session })
  );
  changes += mutationCount(
    await collections
      .incidentComponents()
      .deleteMany(
        {
          $or: [
            { incidentId: { $in: incidentIds } },
            { componentId: { $in: componentIds } },
          ],
        },
        { session }
      )
  );
  changes += mutationCount(
    await collections
      .incidentUpdates()
      .deleteMany({ incidentId: { $in: incidentIds } }, { session })
  );
  changes += mutationCount(
    await collections
      .metricPoints()
      .deleteMany({ metricId: { $in: metricIds } }, { session })
  );
  changes += mutationCount(
    await collections
      .monitorChecks()
      .deleteMany({ monitorId: { $in: monitorIds } }, { session })
  );
  changes += mutationCount(
    await collections
      .monitors()
      .deleteMany({ pageId: { $in: pageIds } }, { session })
  );
  changes += mutationCount(
    await collections
      .components()
      .deleteMany({ pageId: { $in: pageIds } }, { session })
  );
  changes += mutationCount(
    await collections
      .incidents()
      .deleteMany({ pageId: { $in: pageIds } }, { session })
  );
  changes += mutationCount(
    await collections
      .metrics()
      .deleteMany({ pageId: { $in: pageIds } }, { session })
  );
  changes += mutationCount(
    await collections
      .componentGroups()
      .deleteMany({ pageId: { $in: pageIds } }, { session })
  );
  changes += mutationCount(
    await collections
      .incidentTemplates()
      .deleteMany({ pageId: { $in: pageIds } }, { session })
  );
  changes += mutationCount(
    await collections
      .templateGroups()
      .deleteMany({ pageId: { $in: pageIds } }, { session })
  );
  changes += mutationCount(
    await collections
      .webhookEndpoints()
      .deleteMany({ pageId: { $in: pageIds } }, { session })
  );
  changes += mutationCount(
    await collections
      .subscribers()
      .deleteMany({ pageId: { $in: pageIds } }, { session })
  );
  changes += mutationCount(
    await collections
      .subscriptionOtps()
      .deleteMany({ pageId: { $in: pageIdStrings } }, { session })
  );
  changes += mutationCount(
    await collections
      .pageAccessUsers()
      .deleteMany({ pageId: { $in: pageIds } }, { session })
  );
  changes += mutationCount(
    await collections
      .pageAccessGroups()
      .deleteMany({ pageId: { $in: pageIds } }, { session })
  );
  changes += mutationCount(
    await collections
      .notificationJobs()
      .deleteMany({ pageId: { $in: pageIds } }, { session })
  );
  changes += mutationCount(
    await collections
      .notificationLogs()
      .deleteMany({ pageId: { $in: pageIdStrings } }, { session })
  );
  changes += mutationCount(
    await collections
      .feedTokens()
      .deleteMany({ pageId: { $in: pageIds } }, { session })
  );
  changes += mutationCount(
    await collections.assets().deleteMany({ orgId: organizationId }, { session })
  );
  changes += mutationCount(
    await collections
      .notificationDestinations()
      .deleteMany({ pageId: { $in: pageIds } }, { session })
  );
  changes += mutationCount(
    await collections
      .analyticsDaily()
      .deleteMany({ pageId: { $in: pageIds } }, { session })
  );
  changes += mutationCount(
    await collections
      .pageDesignDrafts()
      .deleteMany({ pageId: { $in: pageIds } }, { session })
  );
  changes += mutationCount(
    await collections
      .pageDesignVersions()
      .deleteMany({ pageId: { $in: pageIds } }, { session })
  );
  changes += mutationCount(
    await collections
      .pageAnnouncements()
      .deleteMany({ pageId: { $in: pageIds } }, { session })
  );
  changes += mutationCount(
    await collections.memberships().deleteMany({ orgId: organizationId }, { session })
  );
  changes += mutationCount(
    await db.collection("teamMembers").deleteMany({ orgId: organizationId }, { session })
  );
  changes += mutationCount(
    await db
      .collection<{ _id: string }>("organizationInvariantLocks")
      .deleteMany(
        { _id: `active-owner:${organizationId.toHexString()}` },
        { session }
      )
  );
  changes += mutationCount(
    await collections.supportSessions().updateMany(
      { orgId: organizationId, revokedAt: null },
      {
        $set: {
          revokedAt: new Date(),
          endedAt: new Date(),
          revokedReason: "organization purged",
        },
      },
      { session }
    )
  );
  changes += mutationCount(
    await collections.apiKeys().deleteMany({ orgId: organizationId }, { session })
  );
  changes += mutationCount(
    await collections.auditLogs().deleteMany({ orgId: organizationId }, { session })
  );
  changes += mutationCount(
    await db.collection("invoices").deleteMany({ orgId: organizationId }, { session })
  );

  if (deleteRoots) {
    changes += mutationCount(
      await collections.pages().deleteMany({ orgId: organizationId }, { session })
    );
    changes += mutationCount(
      await collections.organizations().deleteOne({ _id: organizationId }, { session })
    );
  }
  return changes;
}

async function deleteOrganizationAssetObjects(organizationId: ObjectId) {
  const assets = await collections
    .assets()
    .find(
      { orgId: organizationId },
      { projection: { storageKey: 1, storageDriver: 1 } }
    )
    .toArray();
  for (const asset of assets) {
    await recordedAssetStorage(asset.storageDriver).delete(asset.storageKey);
  }
}

async function requireOrganizationAutomationDrain(
  organizationId: ObjectId,
  retainedPageIds: ObjectId[]
) {
  const pageIdsById = new Map(
    retainedPageIds.map((pageId) => [pageId.toHexString(), pageId])
  );
  for (const page of await collections
    .pages()
    .find({ orgId: organizationId }, { projection: { _id: 1 } })
    .toArray()) {
    pageIdsById.set(page._id.toHexString(), page._id);
  }
  const pageIds = [...pageIdsById.values()];
  if (pageIds.length === 0) return;

  const now = new Date();
  const activeMonitor = await collections.monitors().findOne(
    {
      pageId: { $in: pageIds },
      leaseOwner: { $ne: null },
      leaseExpiresAt: { $gt: now },
    },
    { projection: { _id: 1 } }
  );
  const activeDelivery = await collections.notificationJobs().findOne(
    {
      pageId: { $in: pageIds },
      leaseOwner: { $ne: null },
      leaseExpiresAt: { $gt: now },
    },
    { projection: { _id: 1 } }
  );
  if (activeMonitor || activeDelivery) {
    throw new Error(
      "Organization automation is still draining; purge will retry after active leases finish"
    );
  }
}

/**
 * Deletes an entire organization while leaving shared global identities
 * intact. Root page/organization rows stay in place until the final
 * transaction so a retry can rediscover the purge scope even after partial
 * cleanup. Repeated passes retain every discovered descendant identifier and
 * remove late writes until the data set is quiet.
 */
export async function deleteOrgCascade(
  orgId: string,
  options: DeleteOrganizationOptions = {}
) {
  const organizationId = oid(orgId);
  const scope: OrganizationPurgeScope = {
    pageIds: new Map(
      (options.initialScope?.pageIds ?? []).map((value) => [
        value.toHexString(),
        value,
      ])
    ),
    componentIds: new Map(
      (options.initialScope?.componentIds ?? []).map((value) => [
        value.toHexString(),
        value,
      ])
    ),
    incidentIds: new Map(
      (options.initialScope?.incidentIds ?? []).map((value) => [
        value.toHexString(),
        value,
      ])
    ),
    metricIds: new Map(
      (options.initialScope?.metricIds ?? []).map((value) => [
        value.toHexString(),
        value,
      ])
    ),
    monitorIds: new Map(
      (options.initialScope?.monitorIds ?? []).map((value) => [
        value.toHexString(),
        value,
      ])
    ),
  };
  await requireOrganizationAutomationDrain(
    organizationId,
    [...scope.pageIds.values()]
  );
  let quietPasses = 0;
  for (let pass = 0; pass < PURGE_MAX_SETTLE_PASSES; pass += 1) {
    await deleteOrganizationAssetObjects(organizationId);
    const changes = await withTransaction((session) =>
      deleteOrganizationDataPass(
        organizationId,
        scope,
        session,
        false,
        options.recordScope
      )
    );
    quietPasses = changes === 0 ? quietPasses + 1 : 0;
    if (quietPasses >= PURGE_REQUIRED_QUIET_PASSES) break;
    if (pass === PURGE_MAX_SETTLE_PASSES - 1) {
      throw new Error("Organization purge did not reach a stable fixed point");
    }
    const delayMilliseconds =
      options.settleDelayMs ?? PURGE_SETTLE_DELAY_MILLISECONDS;
    if (delayMilliseconds > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMilliseconds));
    }
  }

  await options.beforeFinalize?.();
  await deleteOrganizationAssetObjects(organizationId);
  await withTransaction(async (session) => {
    await deleteOrganizationDataPass(
      organizationId,
      scope,
      session,
      true,
      options.recordScope
    );
    await options.finalize?.(session, serializedPurgeScope(scope));
  });
}

export async function deleteMetricCascade(
  metricId: string,
  organizationId: string,
  pageId: string
) {
  const id = oid(metricId);
  await withTransaction(async (session) => {
    await fenceActiveOrganizationMutation(organizationId, session);
    const page = await collections.pages().findOne(
      { _id: oid(pageId), orgId: oid(organizationId) },
      { session }
    );
    if (!page) throw new Error("Page not found in your organization");
    const metric = await collections.metrics().findOne(
      { _id: id, pageId: page._id },
      { session }
    );
    if (!metric) throw new Error("Metric not found");
    await collections.metricPoints().deleteMany({ metricId: id }, { session });
    const removed = await collections.metrics().deleteOne(
      { _id: metric._id, pageId: page._id },
      { session }
    );
    if (!removed.deletedCount) throw new Error("Metric changed; reload and retry");
  });
  return true;
}

export async function deleteMonitorCascade(
  monitorId: string,
  organizationId: string,
  pageId: string
) {
  const id = oid(monitorId);
  await withTransaction(async (session) => {
    await fenceActiveOrganizationMutation(organizationId, session);
    const page = await collections.pages().findOne(
      { _id: oid(pageId), orgId: oid(organizationId) },
      { session }
    );
    if (!page) throw new Error("Page not found in your organization");
    const monitorDoc = await collections.monitors().findOne(
      { _id: id, pageId: page._id },
      { session }
    );
    if (!monitorDoc) throw new Error("Monitor not found");
    await collections.monitorChecks().deleteMany({ monitorId: id }, { session });
    const removed = await collections.monitors().deleteOne(
      { _id: monitorDoc._id, pageId: page._id },
      { session }
    );
    if (!removed.deletedCount) throw new Error("Monitor changed; reload and retry");
    if (monitorDoc?.metricId) {
      await collections.metricPoints().deleteMany({ metricId: monitorDoc.metricId }, { session });
      await collections.metrics().deleteOne({ _id: monitorDoc.metricId }, { session });
    }
  });
  return true;
}

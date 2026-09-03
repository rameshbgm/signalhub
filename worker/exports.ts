import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { assetStorage } from "@/lib/asset-storage";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import { errorFields, logger } from "@/lib/logger";

function json(value: unknown) {
  return JSON.stringify(value, (key, item) =>
    /password|secret|tokenhash|ciphertext|recoverycode/i.test(key) ? undefined : item
  );
}

async function buildOrganizationExport(orgId: string) {
  const organization = await database.selectFrom("organizations").selectAll()
    .where("id", "=", orgId).executeTakeFirst();
  if (!organization) throw new Error("Organization no longer exists");
  const pages = await database.selectFrom("pages").selectAll().where("orgId", "=", orgId).execute();
  const pageIds = pages.map((page) => page.id);
  const [memberships, apiKeys, assets] = await Promise.all([
    database.selectFrom("memberships").selectAll().where("orgId", "=", orgId).execute(),
    database.selectFrom("apiKeys").selectAll().where("orgId", "=", orgId).execute(),
    database.selectFrom("assets").selectAll().where("orgId", "=", orgId).execute(),
  ]);
  const userIds = memberships.map((membership) => membership.userId);

  const users = userIds.length
    ? await database.selectFrom("users").selectAll().where("id", "in", userIds).execute()
    : [];
  const [componentGroups, components, incidents, subscribers, metrics,
    monitors, endpoints, destinations, notificationLogs, notificationJobs, analytics] = pageIds.length
    ? await Promise.all([
        database.selectFrom("componentGroups").selectAll().where("pageId", "in", pageIds).execute(),
        database.selectFrom("components").selectAll().where("pageId", "in", pageIds).execute(),
        database.selectFrom("incidents").selectAll().where("pageId", "in", pageIds).execute(),
        database.selectFrom("subscribers").selectAll().where("pageId", "in", pageIds).execute(),
        database.selectFrom("metrics").selectAll().where("pageId", "in", pageIds).execute(),
        database.selectFrom("monitors").selectAll().where("pageId", "in", pageIds).execute(),
        database.selectFrom("webhookEndpoints").selectAll().where("pageId", "in", pageIds).execute(),
        database.selectFrom("notificationDestinations").selectAll().where("pageId", "in", pageIds).execute(),
        database.selectFrom("notificationLogs").selectAll().where("pageId", "in", pageIds).execute(),
        database.selectFrom("notificationJobs").selectAll().where("pageId", "in", pageIds).execute(),
        database.selectFrom("analyticsDaily").selectAll().where("pageId", "in", pageIds).execute(),
      ])
    : [[], [], [], [], [], [], [], [], [], [], []] as const;

  const componentIds = components.map((component) => component.id);
  const incidentIds = incidents.map((incident) => incident.id);
  const metricIds = metrics.map((metric) => metric.id);
  const monitorIds = monitors.map((monitor) => monitor.id);
  const [componentStatusEvents, incidentUpdates, incidentComponents, metricPoints, monitorChecks] = await Promise.all([
    componentIds.length
      ? database.selectFrom("componentStatusEvents").selectAll().where("componentId", "in", componentIds).execute()
      : Promise.resolve([]),
    incidentIds.length
      ? database.selectFrom("incidentUpdates").selectAll().where("incidentId", "in", incidentIds).execute()
      : Promise.resolve([]),
    incidentIds.length
      ? database.selectFrom("incidentComponents").selectAll().where("incidentId", "in", incidentIds).execute()
      : Promise.resolve([]),
    metricIds.length
      ? database.selectFrom("metricPoints").selectAll().where("metricId", "in", metricIds).execute()
      : Promise.resolve([]),
    monitorIds.length
      ? database.selectFrom("monitorChecks").selectAll().where("monitorId", "in", monitorIds).execute()
      : Promise.resolve([]),
  ]);
  return {
    manifest: {
      format: "signalhub-organization-export",
      version: 1,
      generatedAt: new Date().toISOString(),
      organizationId: orgId,
      assetObjectsIncluded: false,
    },
    organization,
    users,
    memberships,
    pages,
    componentGroups,
    components,
    componentStatusEvents,
    incidents,
    incidentUpdates,
    incidentComponents,
    subscribers,
    metrics,
    metricPoints,
    monitors,
    monitorChecks,
    webhookEndpoints: endpoints,
    notificationDestinations: destinations,
    notificationLogs,
    notificationJobs,
    analytics,
    apiKeys,
    assetManifest: assets.map((asset) => ({
      id: asset.id,
      pageId: asset.pageId,
      kind: asset.kind,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      storageDriver: asset.storageDriver,
      storageKey: asset.storageKey,
    })),
  };
}

async function leaseDataExportJob(workerId: string) {
  return withDatabaseTransaction(async (transaction) => {
    const now = new Date();
    const candidate = await transaction.selectFrom("dataExportJobs").select("id")
      .where("attempts", "<", 3)
      .where((expression) => expression.or([
        expression("status", "=", "QUEUED"),
        expression.and([
          expression("status", "=", "PROCESSING"),
          expression("leaseExpiresAt", "<=", now),
        ]),
      ]))
      .orderBy("createdAt", "asc").forUpdate().skipLocked().executeTakeFirst();
    if (!candidate) return null;
    return transaction.updateTable("dataExportJobs").set((expression) => ({
      status: "PROCESSING",
      leaseOwner: workerId,
      leaseExpiresAt: new Date(now.getTime() + 10 * 60_000),
      updatedAt: now,
      attempts: expression("attempts", "+", 1),
    })).where("id", "=", candidate.id).returningAll().executeTakeFirst();
  });
}

export async function drainDataExportJobs(workerId: string, limit = 1) {
  let processed = 0;
  while (processed < limit) {
    const job = await leaseDataExportJob(workerId);
    if (!job) break;
    try {
      const payload = await buildOrganizationExport(job.orgId);
      const bytes = gzipSync(Buffer.from(json(payload), "utf8"), { level: 9 });
      const checksum = createHash("sha256").update(bytes).digest("hex");
      const storageKey = `exports/${job.orgId}/${job.id}-${checksum.slice(0, 12)}.json.gz`;
      const storage = assetStorage();
      await storage.put(storageKey, bytes, "application/gzip");
      const completedAt = new Date();
      await database.updateTable("dataExportJobs").set({
        status: "SUCCEEDED",
        storageKey,
        storageDriver: storage.driver,
        checksum,
        lastError: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: completedAt,
        completedAt,
      }).where("id", "=", job.id).where("leaseOwner", "=", workerId).execute();
    } catch (error) {
      logger.error({ ...errorFields(error), exportJobId: job.id, organizationId: job.orgId }, "Organization export failed");
      await database.updateTable("dataExportJobs").set({
        status: job.attempts >= 3 ? "FAILED" : "QUEUED",
        lastError: error instanceof Error ? error.message : "Export failed",
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      }).where("id", "=", job.id).where("leaseOwner", "=", workerId).execute();
    }
    processed += 1;
  }
  return processed;
}

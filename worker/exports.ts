import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { ObjectId } from "mongodb";
import { assetStorage } from "@/lib/asset-storage";
import { collections } from "@/lib/db";

function json(value: unknown) {
  return JSON.stringify(value, (key, item) =>
    /password|secret|tokenhash|ciphertext|recoverycode/i.test(key) ? undefined : item
  );
}

async function buildOrganizationExport(orgId: ObjectId) {
  const organization = await collections.organizations().findOne({ _id: orgId });
  if (!organization) throw new Error("Organization no longer exists");
  const pages = await collections.pages().find({ orgId }).toArray();
  const pageIds = pages.map((page) => page._id);
  const [memberships, auditLogs, apiKeys, assets] = await Promise.all([
    collections.memberships().find({ orgId }).toArray(),
    collections.auditLogs().find({ orgId }).sort({ createdAt: 1 }).toArray(),
    collections.apiKeys().find({ orgId }).toArray(),
    collections.assets().find({ orgId }).toArray(),
  ]);
  const userIds = memberships.map((membership) => membership.userId);
  const [
    users,
    componentGroups,
    components,
    incidents,
    templates,
    templateGroups,
    subscribers,
    metrics,
    monitors,
    endpoints,
    destinations,
    notificationLogs,
    notificationJobs,
    analytics,
  ] = await Promise.all([
    collections.users().find({ _id: { $in: userIds } }).toArray(),
    collections.componentGroups().find({ pageId: { $in: pageIds } }).toArray(),
    collections.components().find({ pageId: { $in: pageIds } }).toArray(),
    collections.incidents().find({ pageId: { $in: pageIds } }).toArray(),
    collections.incidentTemplates().find({ pageId: { $in: pageIds } }).toArray(),
    collections.templateGroups().find({ pageId: { $in: pageIds } }).toArray(),
    collections.subscribers().find({ pageId: { $in: pageIds } }).toArray(),
    collections.metrics().find({ pageId: { $in: pageIds } }).toArray(),
    collections.monitors().find({ pageId: { $in: pageIds } }).toArray(),
    collections.webhookEndpoints().find({ pageId: { $in: pageIds } }).toArray(),
    collections.notificationDestinations().find({ pageId: { $in: pageIds } }).toArray(),
    collections.notificationLogs().find({ pageId: { $in: pageIds.map((id) => id.toHexString()) } }).toArray(),
    collections.notificationJobs().find({ pageId: { $in: pageIds } }).toArray(),
    collections.analyticsDaily().find({ pageId: { $in: pageIds } }).toArray(),
  ]);
  const componentIds = components.map((component) => component._id);
  const incidentIds = incidents.map((incident) => incident._id);
  const metricIds = metrics.map((metric) => metric._id);
  const monitorIds = monitors.map((monitor) => monitor._id);
  const [componentStatusEvents, incidentUpdates, incidentComponents, metricPoints, monitorChecks] =
    await Promise.all([
      collections.componentStatusEvents().find({ componentId: { $in: componentIds } }).toArray(),
      collections.incidentUpdates().find({ incidentId: { $in: incidentIds } }).toArray(),
      collections.incidentComponents().find({ incidentId: { $in: incidentIds } }).toArray(),
      collections.metricPoints().find({ metricId: { $in: metricIds } }).toArray(),
      collections.monitorChecks().find({ monitorId: { $in: monitorIds } }).toArray(),
    ]);
  return {
    manifest: {
      format: "status-organization-export",
      version: 1,
      generatedAt: new Date().toISOString(),
      organizationId: orgId.toHexString(),
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
    templateGroups,
    incidentTemplates: templates,
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
    auditLogs,
    assetManifest: assets.map((asset) => ({
      id: asset._id,
      pageId: asset.pageId,
      kind: asset.kind,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      storageDriver: asset.storageDriver,
      storageKey: asset.storageKey,
    })),
  };
}

export async function drainDataExportJobs(workerId: string, limit = 1) {
  let processed = 0;
  while (processed < limit) {
    const now = new Date();
    const job = await collections.dataExportJobs().findOneAndUpdate(
      {
        $or: [
          { status: "QUEUED" },
          { status: "PROCESSING", leaseExpiresAt: { $lte: now } },
        ],
        attempts: { $lt: 3 },
      },
      {
        $set: {
          status: "PROCESSING",
          leaseOwner: workerId,
          leaseExpiresAt: new Date(now.getTime() + 10 * 60_000),
          updatedAt: now,
        },
        $inc: { attempts: 1 },
      },
      { sort: { createdAt: 1 }, returnDocument: "after" }
    );
    if (!job) break;
    try {
      const payload = await buildOrganizationExport(job.orgId);
      const bytes = gzipSync(Buffer.from(json(payload), "utf8"), { level: 9 });
      const checksum = createHash("sha256").update(bytes).digest("hex");
      const storageKey = `exports/${job.orgId.toHexString()}/${job._id.toHexString()}-${checksum.slice(0, 12)}.json.gz`;
      const storage = assetStorage();
      await storage.put(storageKey, bytes, "application/gzip");
      await collections.dataExportJobs().updateOne(
        { _id: job._id, leaseOwner: workerId },
        {
          $set: {
            status: "SUCCEEDED",
            storageKey,
            storageDriver: storage.driver,
            checksum,
            lastError: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            updatedAt: new Date(),
            completedAt: new Date(),
          },
        }
      );
    } catch (error) {
      await collections.dataExportJobs().updateOne(
        { _id: job._id, leaseOwner: workerId },
        {
          $set: {
            status: job.attempts >= 3 ? "FAILED" : "QUEUED",
            lastError: error instanceof Error ? error.message : "Export failed",
            leaseOwner: null,
            leaseExpiresAt: null,
            updatedAt: new Date(),
          },
        }
      );
    }
    processed += 1;
  }
  return processed;
}

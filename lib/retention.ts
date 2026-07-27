import { db, collections } from "@/lib/db";
import { pruneAuditBefore } from "@/lib/audit-integrity";
import { auditRetentionCutoff } from "@/lib/audit-retention";

export const RETENTION_BOUNDS = {
  monitorChecksDays: { min: 7, max: 3650 },
  analyticsDays: { min: 30, max: 3650 },
  notificationLogsDays: { min: 7, max: 3650 },
  resolvedIncidentsDays: { min: 30, max: 3650 },
  auditLogsDays: { min: 365, max: 3650 },
} as const;

export type EffectiveRetention = {
  [Key in keyof typeof RETENTION_BOUNDS]: number;
};

const FALLBACK_RETENTION: EffectiveRetention = {
  monitorChecksDays: 90,
  analyticsDays: 395,
  notificationLogsDays: 90,
  resolvedIncidentsDays: 730,
  auditLogsDays: 2555,
};

function bounded(policy: Partial<EffectiveRetention>): EffectiveRetention {
  return Object.fromEntries(
    Object.entries(RETENTION_BOUNDS).map(([key, bounds]) => {
      const value = Number(policy[key as keyof EffectiveRetention] ?? FALLBACK_RETENTION[key as keyof EffectiveRetention]);
      return [key, Math.min(bounds.max, Math.max(bounds.min, value))];
    })
  ) as EffectiveRetention;
}

export async function effectiveRetention(orgId?: import("mongodb").ObjectId | null) {
  const defaults = await collections.retentionPolicies().findOne({ orgId: null });
  const override = orgId
    ? await collections.retentionPolicies().findOne({ orgId })
    : null;
  return bounded({ ...defaults, ...override });
}

function cutoff(now: Date, days: number) {
  return new Date(now.getTime() - days * 86_400_000);
}

export async function runRetentionSweep(workerId: string, now = new Date()) {
  const leases = db.collection<{
    _id: string;
    owner: string;
    leaseExpiresAt: Date;
    lastCompletedAt?: Date;
  }>("maintenanceLeases");
  let lease;
  try {
    lease = await leases.findOneAndUpdate(
      {
        _id: "retention",
        $or: [
          { leaseExpiresAt: { $lte: now } },
          { leaseExpiresAt: { $exists: false } },
        ],
      },
      {
        $set: {
          owner: workerId,
          leaseExpiresAt: new Date(now.getTime() + 30 * 60_000),
        },
        $setOnInsert: { _id: "retention" },
      },
      { upsert: true, returnDocument: "after" }
    );
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) return false;
    throw error;
  }
  if (!lease || lease.owner !== workerId) return false;

  const organizations = await collections.organizations().find(
    { status: { $ne: "DELETING" } },
    { projection: { _id: 1 } }
  ).toArray();
  for (const organization of organizations) {
    const policy = await effectiveRetention(organization._id);
    const pages = await collections.pages().find(
      { orgId: organization._id },
      { projection: { _id: 1 } }
    ).toArray();
    const pageIds = pages.map((page) => page._id);
    const pageIdStrings = pageIds.map((pageId) => pageId.toHexString());
    const monitors = await collections.monitors().find(
      { pageId: { $in: pageIds } },
      { projection: { _id: 1 } }
    ).toArray();
    await Promise.all([
      collections.monitorChecks().deleteMany({
        monitorId: { $in: monitors.map((monitor) => monitor._id) },
        checkedAt: { $lt: cutoff(now, policy.monitorChecksDays) },
      }),
      collections.analyticsDaily().deleteMany({
        pageId: { $in: pageIds },
        updatedAt: { $lt: cutoff(now, policy.analyticsDays) },
      }),
      collections.notificationLogs().deleteMany({
        pageId: { $in: pageIdStrings },
        createdAt: { $lt: cutoff(now, policy.notificationLogsDays) },
      }),
      collections.notificationJobs().deleteMany({
        pageId: { $in: pageIds },
        status: { $in: ["SENT", "DEAD_LETTER"] },
        updatedAt: { $lt: cutoff(now, policy.notificationLogsDays) },
      }),
      pruneAuditBefore(auditRetentionCutoff(now), organization._id),
    ]);
    const expiredIncidents = await collections.incidents().find(
      {
        pageId: { $in: pageIds },
        status: "RESOLVED",
        resolvedAt: { $lt: cutoff(now, policy.resolvedIncidentsDays) },
      },
      { projection: { _id: 1 } }
    ).limit(5_000).toArray();
    if (expiredIncidents.length) {
      const ids = expiredIncidents.map((incident) => incident._id);
      await Promise.all([
        collections.incidentUpdates().deleteMany({ incidentId: { $in: ids } }),
        collections.incidentComponents().deleteMany({ incidentId: { $in: ids } }),
      ]);
      await collections.incidents().deleteMany({ _id: { $in: ids } });
    }
  }
  await pruneAuditBefore(auditRetentionCutoff(now));
  await leases.updateOne(
    { _id: "retention", owner: workerId },
    {
      $set: {
        lastCompletedAt: new Date(),
        leaseExpiresAt: new Date(Date.now() + 60 * 60_000),
      },
    }
  );
  return true;
}

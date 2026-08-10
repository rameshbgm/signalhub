import { sql } from "kysely";
import { database } from "@/lib/postgres/client";
import { pruneAuditBefore } from "@/lib/audit-integrity";

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
      const typedKey = key as keyof EffectiveRetention;
      const value = Number(policy[typedKey] ?? FALLBACK_RETENTION[typedKey]);
      return [key, Math.min(bounds.max, Math.max(bounds.min, value))];
    })
  ) as EffectiveRetention;
}

export async function effectiveRetention(orgId?: string | null) {
  const defaults = await database.selectFrom("retentionPolicies").selectAll()
    .where("orgId", "is", null).executeTakeFirst();
  const override = orgId
    ? await database.selectFrom("retentionPolicies").selectAll()
        .where("orgId", "=", orgId).executeTakeFirst()
    : null;
  return bounded({ ...defaults, ...override });
}

function cutoff(now: Date, days: number) {
  return new Date(now.getTime() - days * 86_400_000);
}

async function acquireRetentionLease(workerId: string, now: Date) {
  const expiresAt = new Date(now.getTime() + 30 * 60_000);
  const result = await sql<{ owner: string }>`
    INSERT INTO maintenance_leases (id, owner, lease_expires_at)
    VALUES ('retention', ${workerId}, ${expiresAt})
    ON CONFLICT (id) DO UPDATE
      SET owner = EXCLUDED.owner, lease_expires_at = EXCLUDED.lease_expires_at
      WHERE maintenance_leases.lease_expires_at <= ${now}
    RETURNING owner
  `.execute(database);
  return result.rows[0]?.owner === workerId;
}

export async function runRetentionSweep(workerId: string, now = new Date()) {
  if (!(await acquireRetentionLease(workerId, now))) return false;

  const organizations = await database.selectFrom("organizations").select("id")
    .where("status", "!=", "DELETING").execute();
  for (const organization of organizations) {
    const policy = await effectiveRetention(organization.id);
    const pages = await database.selectFrom("pages").select("id")
      .where("orgId", "=", organization.id).execute();
    const pageIds = pages.map((page) => page.id);
    if (!pageIds.length) {
      await pruneAuditBefore(cutoff(now, policy.auditLogsDays), organization.id);
      continue;
    }
    const monitors = await database.selectFrom("monitors").select("id")
      .where("pageId", "in", pageIds).execute();
    const monitorIds = monitors.map((monitor) => monitor.id);

    const deletes: Array<Promise<unknown>> = [
      database.deleteFrom("analyticsDaily")
        .where("pageId", "in", pageIds)
        .where("updatedAt", "<", cutoff(now, policy.analyticsDays)).execute(),
      database.deleteFrom("notificationLogs")
        .where("pageId", "in", pageIds)
        .where("createdAt", "<", cutoff(now, policy.notificationLogsDays)).execute(),
      database.deleteFrom("notificationJobs")
        .where("pageId", "in", pageIds)
        .where("status", "in", ["SENT", "DEAD_LETTER"])
        .where("updatedAt", "<", cutoff(now, policy.notificationLogsDays)).execute(),
      pruneAuditBefore(cutoff(now, policy.auditLogsDays), organization.id),
    ];
    if (monitorIds.length) {
      deletes.push(database.deleteFrom("monitorChecks")
        .where("monitorId", "in", monitorIds)
        .where("checkedAt", "<", cutoff(now, policy.monitorChecksDays)).execute());
    }
    await Promise.all(deletes);

    const expiredIncidents = await database.selectFrom("incidents").select("id")
      .where("pageId", "in", pageIds)
      .where("status", "=", "RESOLVED")
      .where("resolvedAt", "<", cutoff(now, policy.resolvedIncidentsDays))
      .limit(5_000).execute();
    if (expiredIncidents.length) {
      await database.deleteFrom("incidents")
        .where("id", "in", expiredIncidents.map((incident) => incident.id)).execute();
    }
  }

  const platformPolicy = await effectiveRetention(null);
  await pruneAuditBefore(cutoff(now, platformPolicy.auditLogsDays));
  await database.updateTable("maintenanceLeases").set({
    lastCompletedAt: new Date(),
    leaseExpiresAt: new Date(Date.now() + 60 * 60_000),
  }).where("id", "=", "retention").where("owner", "=", workerId).execute();
  return true;
}

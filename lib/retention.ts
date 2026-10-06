import { sql } from "kysely";
import { database } from "@/lib/postgres/client";
import { pruneAuditBefore } from "@/lib/audit-integrity";

export const RETENTION_BOUNDS = {
  monitorChecksDays: { min: 7, max: 3650 },
  analyticsDays: { min: 30, max: 3650 },
  notificationLogsDays: { min: 7, max: 3650 },
  resolvedIncidentsDays: { min: 30, max: 3650 },
} as const;

export type EffectiveRetention = {
  [Key in keyof typeof RETENTION_BOUNDS]: number;
};

export const FALLBACK_RETENTION: EffectiveRetention = {
  monitorChecksDays: 90,
  analyticsDays: 395,
  notificationLogsDays: 90,
  resolvedIncidentsDays: 730,
};

const PLATFORM_AUDIT_RETENTION_DAYS = 2555;
const EXPIRED_SESSION_HISTORY_DAYS = 30;
/** The sweep runs hourly; the guard must stay shorter than that interval. */
export const RETENTION_RERUN_GUARD_MS = 50 * 60_000;

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
    if (!pageIds.length) continue;
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
    ];
    if (monitorIds.length) {
      deletes.push(database.deleteFrom("monitorChecks")
        .where("monitorId", "in", monitorIds)
        .where("checkedAt", "<", cutoff(now, policy.monitorChecksDays)).execute());
    }
    const metrics = await database.selectFrom("metrics").select("id")
      .where("pageId", "in", pageIds).execute();
    if (metrics.length) {
      // Metric history is visitor-facing analytics, so it follows that window.
      deletes.push(database.deleteFrom("metricPoints")
        .where("metricId", "in", metrics.map((metric) => metric.id))
        .where("timestamp", "<", cutoff(now, policy.analyticsDays)).execute());
    }
    // Closed status intervals older than the incident history window no longer
    // feed any uptime bar or incident timeline.
    deletes.push(database.deleteFrom("componentStatusEvents")
      .where("componentId", "in", (query) => query.selectFrom("components").select("id").where("pageId", "in", pageIds))
      .where("endedAt", "is not", null)
      .where("endedAt", "<", cutoff(now, policy.resolvedIncidentsDays)).execute());
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

  // Short-lived operational rows that are never read once expired.
  await Promise.all([
    database.deleteFrom("rateLimits").where("expiresAt", "<", now).execute(),
    database.deleteFrom("subscriptionOtps").where("expiresAt", "<", now).execute(),
    database.deleteFrom("authSessions")
      .where("absoluteExpiresAt", "<", cutoff(now, EXPIRED_SESSION_HISTORY_DAYS)).execute(),
  ]);
  await pruneAuditBefore(cutoff(now, PLATFORM_AUDIT_RETENTION_DAYS));
  await database.updateTable("maintenanceLeases").set({
    lastCompletedAt: new Date(),
    // Hold the lease until just before the next hourly schedule so another
    // worker does not repeat the sweep, without making the next run skip.
    leaseExpiresAt: new Date(now.getTime() + RETENTION_RERUN_GUARD_MS),
  }).where("id", "=", "retention").where("owner", "=", workerId).execute();
  return true;
}

import { sql } from "kysely";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import type { MonitorRow } from "@/lib/postgres/schema";
import { createIncident, addIncidentUpdate } from "@/lib/domain/incidents";
import { dispatchNotifications } from "@/lib/notify";
import { reconcileComponentStatus } from "@/lib/component-status";
import { runCheck } from "@/worker/checks";
import { startLeaseHeartbeat } from "@/worker/lease-heartbeat";

function monitorLeaseMilliseconds(monitor: MonitorRow) {
  return Math.max(30_000, monitor.timeoutMs * 2);
}

async function renewMonitorLease(monitor: MonitorRow, workerId: string) {
  const renewed = await database
    .updateTable("monitors")
    .set({ leaseExpiresAt: new Date(Date.now() + monitorLeaseMilliseconds(monitor)) })
    .where("id", "=", monitor.id)
    .where("leaseOwner", "=", workerId)
    .returning("id")
    .executeTakeFirst();
  if (!renewed) throw new Error("Monitor lease is no longer owned by this worker");
}

async function releaseMonitorLease(monitorId: string, workerId: string) {
  await database
    .updateTable("monitors")
    .set({ leaseOwner: null, leaseExpiresAt: null })
    .where("id", "=", monitorId)
    .where("leaseOwner", "=", workerId)
    .execute();
}

async function activeOrganizationForMonitor(monitor: MonitorRow) {
  return database
    .selectFrom("pages as page")
    .innerJoin("organizations as organization", "organization.id", "page.orgId")
    .select("organization.id as orgId")
    .where("page.id", "=", monitor.pageId)
    .where("page.deletedAt", "is", null)
    .where("organization.status", "=", "ACTIVE")
    .where("organization.suspended", "=", false)
    .executeTakeFirst();
}

async function leaseDueMonitors(workerId: string, limit = 20) {
  return withDatabaseTransaction(async (transaction) => {
    const now = new Date();
    const candidates = await transaction
      .selectFrom("monitors")
      .selectAll()
      .where("enabled", "=", true)
      .where((expression) => expression.or([
        expression("leaseExpiresAt", "is", null),
        expression("leaseExpiresAt", "<=", now),
      ]))
      .where(sql<boolean>`(
        (run_requested_at is not null and (last_checked_at is null or run_requested_at > last_checked_at))
        or last_checked_at is null
        or last_checked_at + interval_sec * interval '1 second' <= ${now}
      )`)
      .orderBy(sql`run_requested_at asc nulls last`)
      .orderBy(sql`last_checked_at asc nulls first`)
      .forUpdate()
      .skipLocked()
      .limit(limit)
      .execute();

    const leased: MonitorRow[] = [];
    for (const monitor of candidates) {
      const leaseExpiresAt = new Date(now.getTime() + monitorLeaseMilliseconds(monitor));
      const claimed = await transaction
        .updateTable("monitors")
        .set({ leaseOwner: workerId, leaseExpiresAt })
        .where("id", "=", monitor.id)
        .returningAll()
        .executeTakeFirst();
      if (claimed) leased.push(claimed);
    }
    return leased;
  });
}

async function commitMonitorResult(
  monitor: MonitorRow,
  workerId: string,
  result: Awaited<ReturnType<typeof runCheck>>,
  state: {
    now: Date;
    consecutiveFails: number;
    consecutiveOks: number;
    isDown: boolean;
  }
) {
  return withDatabaseTransaction(async (transaction) => {
    const activeOrganization = await transaction
      .selectFrom("pages as page")
      .innerJoin("organizations as organization", "organization.id", "page.orgId")
      .select("organization.id as orgId")
      .where("page.id", "=", monitor.pageId)
      .where("page.deletedAt", "is", null)
      .where("organization.status", "=", "ACTIVE")
      .where("organization.suspended", "=", false)
      .forShare()
      .executeTakeFirst();
    if (!activeOrganization) return null;

    const updated = await transaction
      .updateTable("monitors")
      .set({
        lastCheckedAt: state.now,
        lastLatencyMs: result.latencyMs,
        lastOk: result.ok,
        lastError: result.error,
        consecutiveFails: state.consecutiveFails,
        consecutiveOks: state.consecutiveOks,
        isDown: state.isDown,
        runRequestedAt: null,
      })
      .where("id", "=", monitor.id)
      .where("leaseOwner", "=", workerId)
      .returning("id")
      .executeTakeFirst();
    if (!updated) throw new Error("Monitor lease is no longer owned by this worker");

    await transaction.insertInto("monitorChecks").values({
      monitorId: monitor.id,
      checkedAt: state.now,
      ok: result.ok,
      latencyMs: result.latencyMs,
      statusCode: result.statusCode,
      error: result.error,
    }).execute();

    if (monitor.actionRecordMetric && monitor.metricId && result.latencyMs !== null) {
      await transaction.insertInto("metricPoints").values({
        metricId: monitor.metricId,
        timestamp: state.now,
        value: result.latencyMs,
      }).execute();
    }
    return activeOrganization.orgId;
  });
}

export async function processMonitor(monitor: MonitorRow, workerId: string) {
  if (!(await activeOrganizationForMonitor(monitor))) {
    await releaseMonitorLease(monitor.id, workerId);
    return;
  }

  const heartbeat = startLeaseHeartbeat(
    () => renewMonitorLease(monitor, workerId),
    Math.max(10_000, Math.floor(monitorLeaseMilliseconds(monitor) / 3))
  );
  try {
    const result = await runCheck(monitor);

    // Network I/O may overlap a lifecycle transition. Re-check the tenant and
    // prove lease ownership before persisting any check, metric, or incident.
    if (!(await activeOrganizationForMonitor(monitor))) return;
    await renewMonitorLease(monitor, workerId);

    const now = new Date();
    const consecutiveFails = result.ok ? 0 : monitor.consecutiveFails + 1;
    const consecutiveOks = result.ok ? monitor.consecutiveOks + 1 : 0;
    const wasDown = monitor.isDown;
    const isDown = result.ok
      ? wasDown && consecutiveOks < Math.max(1, monitor.recoverThreshold)
      : wasDown || consecutiveFails >= Math.max(1, monitor.failThreshold);
    const becameDown = !wasDown && isDown;
    const becameUp = wasDown && !isDown;
    const organizationId = await commitMonitorResult(monitor, workerId, result, {
      now,
      consecutiveFails,
      consecutiveOks,
      isDown,
    });
    if (!organizationId) return;

    let currentIncidentId = monitor.currentIncidentId;
    if (becameDown && monitor.actionAutoIncident && monitor.componentId) {
      const incident = await createIncident(organizationId, {
        pageId: monitor.pageId,
        name: `${monitor.name} is failing`,
        status: "INVESTIGATING",
        impact: monitor.downStatus === "MAJOR_OUTAGE" ? "CRITICAL" : "MAJOR",
        body: result.error ?? `${monitor.name} failed its configured threshold`,
        notify: monitor.actionNotify,
        pageWide: false,
        components: [{
          componentId: monitor.componentId,
          status: monitor.downStatus as "DEGRADED_PERFORMANCE" | "PARTIAL_OUTAGE" | "MAJOR_OUTAGE",
        }],
      });
      currentIncidentId = incident.id;
      await database
        .updateTable("monitors")
        .set({ currentIncidentId })
        .where("id", "=", monitor.id)
        .where("leaseOwner", "=", workerId)
        .execute();
    } else if (becameDown && monitor.actionNotify) {
      await dispatchNotifications({
        pageId: monitor.pageId,
        subject: `[Monitor Down] ${monitor.name}`,
        body: result.error ?? "The monitor crossed its failure threshold",
        eventType: "monitor.down",
        eventId: `${monitor.id}:${now.toISOString()}:down`,
        componentIds: monitor.componentId ? [monitor.componentId] : [],
      });
    }

    if (becameUp && currentIncidentId) {
      const recoveryBody = `${monitor.name} recovered after ${consecutiveOks} successful checks.`;
      let resolvedIncident = false;
      try {
        await addIncidentUpdate(organizationId, currentIncidentId, {
          status: "RESOLVED",
          body: recoveryBody,
          notify: monitor.actionNotify,
        });
        resolvedIncident = true;
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "Incident not found") throw error;
      }
      currentIncidentId = null;
      await database
        .updateTable("monitors")
        .set({ currentIncidentId: null })
        .where("id", "=", monitor.id)
        .where("leaseOwner", "=", workerId)
        .execute();
      if (!resolvedIncident && monitor.actionNotify) {
        await dispatchNotifications({
          pageId: monitor.pageId,
          subject: `[Monitor Recovered] ${monitor.name}`,
          body: recoveryBody,
          eventType: "monitor.recovered",
          eventId: `${monitor.id}:${now.toISOString()}:up`,
          componentIds: monitor.componentId ? [monitor.componentId] : [],
        });
      }
    } else if (becameUp && monitor.actionNotify) {
      await dispatchNotifications({
        pageId: monitor.pageId,
        subject: `[Monitor Recovered] ${monitor.name}`,
        body: `${monitor.name} recovered after ${consecutiveOks} successful checks.`,
        eventType: "monitor.recovered",
        eventId: `${monitor.id}:${now.toISOString()}:up`,
        componentIds: monitor.componentId ? [monitor.componentId] : [],
      });
    }

    if (monitor.componentId && monitor.actionFlipStatus) {
      await reconcileComponentStatus(monitor.componentId);
    }
  } catch (error) {
    await database
      .updateTable("monitors")
      .set({
        lastError: error instanceof Error ? error.message.slice(0, 1_000) : "Monitor processing failed",
      })
      .where("id", "=", monitor.id)
      .where("leaseOwner", "=", workerId)
      .execute();
  } finally {
    await heartbeat.stop();
    await releaseMonitorLease(monitor.id, workerId);
  }
}

export async function runDueMonitors(workerId: string, limit = 20) {
  const monitors = await leaseDueMonitors(workerId, limit);
  await Promise.all(monitors.map((monitor) => processMonitor(monitor, workerId)));
  return monitors.length;
}

import { ObjectId, type WithId } from "mongodb";
import { collections, type MonitorDoc } from "@/lib/db";
import { createIncident, addIncidentUpdate } from "@/lib/domain/incidents";
import { dispatchNotifications } from "@/lib/notify";
import { reconcileComponentStatus } from "@/lib/component-status";
import { runCheck } from "@/worker/checks";
import { organizationIsActive } from "@/lib/organization-state";
import { startLeaseHeartbeat } from "@/worker/lease-heartbeat";

function monitorLeaseMilliseconds(monitor: WithId<MonitorDoc>) {
  return Math.max(30_000, monitor.timeoutMs * 2);
}

async function renewMonitorLease(
  monitor: WithId<MonitorDoc>,
  workerId: string
) {
  const renewed = await collections.monitors().updateOne(
    { _id: monitor._id, leaseOwner: workerId },
    {
      $set: {
        leaseExpiresAt: new Date(
          Date.now() + monitorLeaseMilliseconds(monitor)
        ),
      },
    }
  );
  if (renewed.matchedCount !== 1) {
    throw new Error("Monitor lease is no longer owned by this worker");
  }
}

async function organizationForMonitorIsActive(monitor: WithId<MonitorDoc>) {
  const page = await collections.pages().findOne({ _id: monitor.pageId });
  const organization = page
    ? await collections.organizations().findOne({ _id: page.orgId })
    : null;
  return Boolean(
    page && organization && organizationIsActive(organization)
  );
}

async function leaseMonitor(monitor: WithId<MonitorDoc>, workerId: string, now: Date) {
  const dueAt = monitor.lastCheckedAt
    ? new Date(monitor.lastCheckedAt.getTime() + monitor.intervalSec * 1000)
    : new Date(0);
  const requested = monitor.runRequestedAt && (!monitor.lastCheckedAt || monitor.runRequestedAt > monitor.lastCheckedAt);
  if (!requested && dueAt > now) return null;
  return collections.monitors().findOneAndUpdate(
    {
      _id: monitor._id,
      enabled: true,
      $or: [{ leaseExpiresAt: null }, { leaseExpiresAt: { $lte: now } }],
    },
    {
      $set: {
        leaseOwner: workerId,
        leaseExpiresAt: new Date(
          now.getTime() + monitorLeaseMilliseconds(monitor)
        ),
      },
    },
    { returnDocument: "after" }
  );
}

export async function leaseDueMonitors(workerId: string, limit = 20) {
  const now = new Date();
  const candidates = await collections
    .monitors()
    .find({
      enabled: true,
      $or: [{ leaseExpiresAt: null }, { leaseExpiresAt: { $lte: now } }],
    })
    .sort({ runRequestedAt: 1, lastCheckedAt: 1 })
    .limit(limit * 4)
    .toArray();
  const leased: WithId<MonitorDoc>[] = [];
  for (const candidate of candidates) {
    if (leased.length >= limit) break;
    const monitor = await leaseMonitor(candidate, workerId, now);
    if (monitor) leased.push(monitor);
  }
  return leased;
}

export async function processMonitor(monitor: WithId<MonitorDoc>, workerId: string) {
  if (!(await organizationForMonitorIsActive(monitor))) {
    await collections.monitors().updateOne(
      { _id: monitor._id, leaseOwner: workerId },
      { $set: { leaseOwner: null, leaseExpiresAt: null } }
    );
    return;
  }
  const heartbeat = startLeaseHeartbeat(
    () => renewMonitorLease(monitor, workerId),
    Math.max(10_000, Math.floor(monitorLeaseMilliseconds(monitor) / 3))
  );
  let result: Awaited<ReturnType<typeof runCheck>>;
  try {
    result = await runCheck(monitor);
    // The network request may have started before the organization entered the
    // DELETING lifecycle. Re-check after I/O and prove lease ownership before
    // any result, metric, incident, or delivery can be written.
    if (!(await organizationForMonitorIsActive(monitor))) {
      await heartbeat.stop();
      await collections.monitors().updateOne(
        { _id: monitor._id, leaseOwner: workerId },
        { $set: { leaseOwner: null, leaseExpiresAt: null } }
      );
      return;
    }
    await renewMonitorLease(monitor, workerId);
  } catch (error) {
    await heartbeat.stop();
    await collections.monitors().updateOne(
      { _id: monitor._id, leaseOwner: workerId },
      { $set: { leaseOwner: null, leaseExpiresAt: null } }
    );
    throw error;
  }
  const now = new Date();
  const consecutiveFails = result.ok ? 0 : monitor.consecutiveFails + 1;
  const consecutiveOks = result.ok ? monitor.consecutiveOks + 1 : 0;
  const wasDown = monitor.isDown;
  const isDown = result.ok
    ? wasDown && consecutiveOks < Math.max(1, monitor.recoverThreshold)
    : wasDown || consecutiveFails >= Math.max(1, monitor.failThreshold);
  const becameDown = !wasDown && isDown;
  const becameUp = wasDown && !isDown;

  try {
    await collections.monitorChecks().insertOne({
      _id: new ObjectId(),
      monitorId: monitor._id,
      checkedAt: now,
      ok: result.ok,
      latencyMs: result.latencyMs,
      statusCode: result.statusCode,
      error: result.error,
    });
    await collections.monitors().updateOne(
      { _id: monitor._id, leaseOwner: workerId },
      {
        $set: {
          lastCheckedAt: now,
          lastLatencyMs: result.latencyMs,
          lastOk: result.ok,
          lastError: result.error,
          consecutiveFails,
          consecutiveOks,
          isDown,
          runRequestedAt: null,
        },
      }
    );
    if (monitor.actionRecordMetric && monitor.metricId && result.latencyMs !== null) {
      await collections.metricPoints().insertOne({
        _id: new ObjectId(),
        metricId: monitor.metricId,
        timestamp: now,
        value: result.latencyMs,
      });
    }

    let currentIncidentId = monitor.currentIncidentId;
    if (becameDown && monitor.actionAutoIncident && monitor.componentId) {
      const page = await collections.pages().findOne({ _id: monitor.pageId });
      if (page) {
        const incident = await createIncident(page.orgId.toHexString(), {
          pageId: monitor.pageId.toHexString(),
          name: `${monitor.name} is failing`,
          status: "INVESTIGATING",
          impact: monitor.downStatus === "MAJOR_OUTAGE" ? "CRITICAL" : "MAJOR",
          body: result.error ?? `${monitor.name} failed its configured threshold`,
          notify: monitor.actionNotify,
          pageWide: false,
          components: [
            {
              componentId: monitor.componentId.toHexString(),
              status: monitor.downStatus as "DEGRADED_PERFORMANCE" | "PARTIAL_OUTAGE" | "MAJOR_OUTAGE",
            },
          ],
        });
        currentIncidentId = new ObjectId(incident.id);
        await collections.monitors().updateOne(
          { _id: monitor._id, leaseOwner: workerId },
          { $set: { currentIncidentId } }
        );
      }
    } else if (becameDown && monitor.actionNotify) {
      await dispatchNotifications({
        pageId: monitor.pageId.toHexString(),
        subject: `[Monitor Down] ${monitor.name}`,
        body: result.error ?? "The monitor crossed its failure threshold",
        eventType: "monitor.down",
        eventId: `${monitor._id.toHexString()}:${now.toISOString()}:down`,
        componentIds: monitor.componentId ? [monitor.componentId.toHexString()] : [],
      });
    }

    if (becameUp && currentIncidentId) {
      const page = await collections.pages().findOne({ _id: monitor.pageId });
      const recoveryBody = `${monitor.name} recovered after ${consecutiveOks} successful checks.`;
      let resolvedIncident = false;
      if (page) {
        try {
          await addIncidentUpdate(
            page.orgId.toHexString(),
            currentIncidentId.toHexString(),
            {
              status: "RESOLVED",
              body: recoveryBody,
              notify: monitor.actionNotify,
            }
          );
          resolvedIncident = true;
        } catch (error) {
          if (
            !(error instanceof Error) ||
            error.message !== "Incident not found"
          ) {
            throw error;
          }
          // The incident may have been removed manually while the monitor was
          // down. Treat the stale pointer as already resolved and clear it.
        }
      }
      currentIncidentId = null;
      await collections.monitors().updateOne(
        { _id: monitor._id, leaseOwner: workerId },
        { $set: { currentIncidentId: null } }
      );
      if (!resolvedIncident && monitor.actionNotify) {
        await dispatchNotifications({
          pageId: monitor.pageId.toHexString(),
          subject: `[Monitor Recovered] ${monitor.name}`,
          body: recoveryBody,
          eventType: "monitor.recovered",
          eventId: `${monitor._id.toHexString()}:${now.toISOString()}:up`,
          componentIds: monitor.componentId
            ? [monitor.componentId.toHexString()]
            : [],
        });
      }
    } else if (becameUp && monitor.actionNotify) {
      await dispatchNotifications({
        pageId: monitor.pageId.toHexString(),
        subject: `[Monitor Recovered] ${monitor.name}`,
        body: `${monitor.name} recovered after ${consecutiveOks} successful checks.`,
        eventType: "monitor.recovered",
        eventId: `${monitor._id.toHexString()}:${now.toISOString()}:up`,
        componentIds: monitor.componentId ? [monitor.componentId.toHexString()] : [],
      });
    }

    if (monitor.componentId && monitor.actionFlipStatus) {
      await reconcileComponentStatus(monitor.componentId);
    }
  } catch (error) {
    await collections.monitors().updateOne(
      { _id: monitor._id, leaseOwner: workerId },
      {
        $set: {
          lastError: error instanceof Error ? error.message.slice(0, 1_000) : "Monitor processing failed",
        },
      }
    );
  } finally {
    await heartbeat.stop();
    await collections.monitors().updateOne(
      { _id: monitor._id, leaseOwner: workerId },
      { $set: { leaseOwner: null, leaseExpiresAt: null } }
    );
  }
}

export async function runDueMonitors(workerId: string, limit = 20) {
  const monitors = await leaseDueMonitors(workerId, limit);
  await Promise.all(monitors.map((monitor) => processMonitor(monitor, workerId)));
  return monitors.length;
}

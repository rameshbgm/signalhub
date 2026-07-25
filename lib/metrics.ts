import { collectDefaultMetrics, Gauge, Registry } from "prom-client";
import { collections } from "@/lib/db";

const globalMetrics = globalThis as unknown as { statusRegistry?: Registry };

export function metricsRegistry() {
  if (globalMetrics.statusRegistry) return globalMetrics.statusRegistry;
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: "status_" });
  new Gauge({
    name: "status_info",
    help: "SignalHub platform build information",
    labelNames: ["service", "version"],
    registers: [registry],
    collect() {
      this.set(
        { service: process.env.SERVICE_NAME ?? "web", version: process.env.npm_package_version ?? "unknown" },
        1
      );
    },
  });
  globalMetrics.statusRegistry = registry;
  return registry;
}

export async function applicationMetrics() {
  const registry = metricsRegistry();
  const [pendingNotifications, deadLetters, activeWorkers, queuedPlatformJobs] = await Promise.all([
    collections.notificationJobs().countDocuments({ status: "PENDING" }),
    collections.notificationJobs().countDocuments({ status: "DEAD_LETTER" }),
    collections.workerHeartbeats().countDocuments({
      status: "READY",
      lastSeenAt: { $gt: new Date(Date.now() - 30_000) },
    }),
    collections.platformJobs().countDocuments({ status: { $in: ["QUEUED", "PROCESSING"] } }),
  ]);
  return [
    await registry.metrics(),
    "# HELP status_notification_jobs Number of notification jobs by state",
    "# TYPE status_notification_jobs gauge",
    `status_notification_jobs{state="pending"} ${pendingNotifications}`,
    `status_notification_jobs{state="dead_letter"} ${deadLetters}`,
    "# HELP status_active_workers Number of recently ready workers",
    "# TYPE status_active_workers gauge",
    `status_active_workers ${activeWorkers}`,
    "# HELP status_platform_jobs Number of queued or processing platform jobs",
    "# TYPE status_platform_jobs gauge",
    `status_platform_jobs ${queuedPlatformJobs}`,
    "",
  ].join("\n");
}

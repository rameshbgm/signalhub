import { collectDefaultMetrics, Gauge, Registry } from "prom-client";
import { database } from "@/lib/postgres/client";

const globalMetrics = globalThis as unknown as { statusRegistry?: Registry };

function metricsRegistry() {
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
    database.selectFrom("notificationJobs").select(({ fn }) => fn.countAll<number>().as("count")).where("status", "=", "PENDING").executeTakeFirstOrThrow(),
    database.selectFrom("notificationJobs").select(({ fn }) => fn.countAll<number>().as("count")).where("status", "=", "DEAD_LETTER").executeTakeFirstOrThrow(),
    database.selectFrom("workerHeartbeats").select(({ fn }) => fn.countAll<number>().as("count")).where("status", "=", "READY").where("lastSeenAt", ">", new Date(Date.now() - 30_000)).executeTakeFirstOrThrow(),
    database.selectFrom("platformJobs").select(({ fn }) => fn.countAll<number>().as("count")).where("status", "in", ["QUEUED", "PROCESSING"]).executeTakeFirstOrThrow(),
  ]);
  return [
    await registry.metrics(),
    "# HELP status_notification_jobs Number of notification jobs by state",
    "# TYPE status_notification_jobs gauge",
    `status_notification_jobs{state="pending"} ${pendingNotifications.count}`,
    `status_notification_jobs{state="dead_letter"} ${deadLetters.count}`,
    "# HELP status_active_workers Number of recently ready workers",
    "# TYPE status_active_workers gauge",
    `status_active_workers ${activeWorkers.count}`,
    "# HELP status_platform_jobs Number of queued or processing platform jobs",
    "# TYPE status_platform_jobs gauge",
    `status_platform_jobs ${queuedPlatformJobs.count}`,
    "",
  ].join("\n");
}

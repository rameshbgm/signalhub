import http from "node:http";
import os from "node:os";
import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import packageJson from "@/package.json";
import { collections, db, mongoClient } from "@/lib/db";
import { runMaintenanceTransitions } from "@/lib/domain/maintenance";
import { drainNotificationJobs, verifySmtp } from "@/worker/notifications";
import { runDueMonitors } from "@/worker/monitors";
import { drainPlatformJobs } from "@/worker/platform-jobs";
import { applicationMetrics } from "@/lib/metrics";
import { log } from "@/lib/logger";
import { hashSecret, secretMatches } from "@/lib/secrets";
import { runRetentionSweep } from "@/lib/retention";
import { drainDataExportJobs } from "@/worker/exports";
import { sealAuditEntries } from "@/lib/audit-integrity";
import { startTelemetry, stopTelemetry } from "@/lib/telemetry";
import { drainAuditDeliveryJobs } from "@/worker/audit-delivery";

const workerId =
  process.env.WORKER_ID ??
  `${os.hostname()}-${process.pid}-${randomBytes(4).toString("hex")}`;
const state = {
  live: true,
  ready: false,
  stopping: false,
  lastLoopAt: null as Date | null,
  lastError: null as string | null,
  smtp: { configured: Boolean(process.env.SMTP_HOST), ok: false },
};

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function heartbeat(status: "STARTING" | "READY" | "STOPPING") {
  const now = new Date();
  await collections.workerHeartbeats().updateOne(
    { workerId },
    {
      $set: {
        lastSeenAt: now,
        status,
        version: packageJson.version,
        lastLoopAt: state.lastLoopAt,
        lastError: state.lastError,
      },
      $setOnInsert: {
        _id: new ObjectId(),
        workerId,
        startedAt: now,
      },
    },
    { upsert: true }
  );
}

function healthServer() {
  return http.createServer(async (request, response) => {
    if (request.url === "/metrics") {
      const configured = process.env.METRICS_TOKEN;
      const authorization = request.headers.authorization ?? "";
      const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      if (!configured || !token || !secretMatches(token, hashSecret(configured))) {
        response.statusCode = configured ? 401 : 404;
        response.end(configured ? "Unauthorized" : "Not found");
        return;
      }
      response.setHeader("content-type", "text/plain; version=0.0.4; charset=utf-8");
      response.end(await applicationMetrics());
      return;
    }
    response.setHeader("content-type", "application/json; charset=utf-8");
    if (request.url === "/live") {
      response.statusCode = state.live ? 200 : 503;
      response.end(JSON.stringify({ live: state.live, workerId, version: packageJson.version }));
      return;
    }
    if (request.url === "/ready") {
      try {
        await db.command({ ping: 1 });
        response.statusCode = state.ready && !state.stopping ? 200 : 503;
      } catch {
        response.statusCode = 503;
      }
      response.end(
        JSON.stringify({
          ready: state.ready && !state.stopping,
          workerId,
          lastLoopAt: state.lastLoopAt,
          lastError: state.lastError,
          smtp: state.smtp,
        })
      );
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "Not found" }));
  });
}

async function main() {
  await startTelemetry("signalhub-worker");
  await db.command({ ping: 1 });
  await heartbeat("STARTING");
  state.smtp = await verifySmtp();
  const server = healthServer();
  const port = Number(process.env.WORKER_HEALTH_PORT ?? 8081);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", resolve);
  });

  let lastMaintenanceRun = 0;
  let lastHeartbeat = 0;
  let lastRetentionAttempt = 0;
  let lastAuditSeal = 0;
  let failures = 0;
  let platformJobDrain: Promise<void> | null = null;
  let platformJobError: string | null = null;
  state.ready = true;
  await heartbeat("READY");

  const stop = () => {
    state.stopping = true;
    state.ready = false;
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  while (!state.stopping) {
    try {
      const now = Date.now();
      const tasks: Promise<unknown>[] = [
        runDueMonitors(workerId, Number(process.env.WORKER_MONITOR_CONCURRENCY ?? 20)),
        drainNotificationJobs(workerId, Number(process.env.WORKER_NOTIFICATION_BATCH ?? 25)),
        drainDataExportJobs(workerId, 1),
        drainAuditDeliveryJobs(workerId, 25),
      ];
      // Organization purges can be much slower than a monitor/delivery cycle.
      // Keep one drain in flight without holding up those tenant workloads.
      if (!platformJobDrain) {
        platformJobDrain = drainPlatformJobs(
          workerId,
          Number(process.env.WORKER_PLATFORM_JOB_BATCH ?? 1)
        )
          .then(() => {
            platformJobError = null;
          })
          .catch((error) => {
            platformJobError =
              error instanceof Error ? error.message : "Platform job drain failed";
          })
          .finally(() => {
            platformJobDrain = null;
          });
      }
      if (now - lastMaintenanceRun >= 10_000) {
        tasks.push(runMaintenanceTransitions(new Date(now)));
        lastMaintenanceRun = now;
      }
      if (now - lastHeartbeat >= 5_000) {
        tasks.push(heartbeat("READY"));
        lastHeartbeat = now;
      }
      if (now - lastRetentionAttempt >= 60 * 60_000) {
        tasks.push(runRetentionSweep(workerId, new Date(now)));
        lastRetentionAttempt = now;
      }
      if (now - lastAuditSeal >= 60_000) {
        tasks.push(sealAuditEntries());
        lastAuditSeal = now;
      }
      await Promise.all(tasks);
      state.lastLoopAt = new Date();
      state.lastError = platformJobError;
      failures = 0;
      await delay(Number(process.env.WORKER_POLL_INTERVAL_MS ?? 1_000));
    } catch (error) {
      failures += 1;
      state.lastError = error instanceof Error ? error.message : "Worker loop failed";
      const backoff = Math.min(30_000, 1_000 * 2 ** Math.min(failures, 5));
      await delay(backoff);
    }
  }

  await platformJobDrain;
  await heartbeat("STOPPING").catch(() => undefined);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mongoClient.close();
  await stopTelemetry();
}

main().catch((error) => {
  log("error", "Worker terminated", { error, workerId });
  process.exitCode = 1;
});

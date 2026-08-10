import http from "node:http";
import os from "node:os";
import { randomBytes } from "node:crypto";
import {
  Logger as GraphileLogger,
  parseCronItems,
  run,
  type Runner,
} from "graphile-worker";
import packageJson from "@/package.json";
import {
  closeDatabase,
  database,
  postgresPool,
  verifyDatabaseConnection,
} from "@/lib/postgres/client";
import { JOB_TASKS, type SignalHubJobTask } from "@/lib/jobs";
import { applicationMetrics } from "@/lib/metrics";
import { errorFields, log, logger } from "@/lib/logger";
import { hashSecret, secretMatches } from "@/lib/secrets";
import { startTelemetry, stopTelemetry } from "@/lib/telemetry";
import { verifySmtp } from "@/worker/notifications";
import { signalHubTaskList } from "@/worker/tasks";

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

const CONTINUOUS_TASKS: SignalHubJobTask[] = [
  JOB_TASKS.monitors,
  JOB_TASKS.notifications,
  JOB_TASKS.exports,
  JOB_TASKS.auditDelivery,
  JOB_TASKS.platformJobs,
  JOB_TASKS.maintenance,
];

const graphileLogger = new GraphileLogger((scope) => (level, message, metadata) => {
  const mappedLevel = level === "warning" ? "warn" : level === "info" ? "debug" : level;
  log(mappedLevel, message, {
    component: "graphile-worker",
    graphile: scope,
    ...(metadata ?? {}),
  });
});

async function heartbeat(status: "STARTING" | "READY" | "STOPPING") {
  const now = new Date();
  await database
    .insertInto("workerHeartbeats")
    .values({
      workerId,
      startedAt: now,
      lastSeenAt: now,
      status,
      version: packageJson.version,
      lastLoopAt: state.lastLoopAt,
      lastError: state.lastError,
    })
    .onConflict((conflict) => conflict.column("workerId").doUpdateSet({
      lastSeenAt: now,
      status,
      version: packageJson.version,
      lastLoopAt: state.lastLoopAt,
      lastError: state.lastError,
    }))
    .execute();
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
        await verifyDatabaseConnection();
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

async function seedContinuousTasks(runner: Runner) {
  await Promise.all(CONTINUOUS_TASKS.map((task) => runner.addJob(task, {}, {
    queueName: task,
    jobKey: `signalhub:${task}`,
    jobKeyMode: "replace",
    maxAttempts: 25,
  })));
}

async function closeServer(server: http.Server | null) {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function main() {
  let runner: Runner | null = null;
  let server: http.Server | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatUpdate = Promise.resolve();

  await startTelemetry("signalhub-worker");
  try {
    await verifyDatabaseConnection();
    await heartbeat("STARTING");
    state.smtp = await verifySmtp();

    server = healthServer();
    const port = Number(process.env.WORKER_HEALTH_PORT ?? 8081);
    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(port, "0.0.0.0", resolve);
    });

    const tasks = signalHubTaskList({
      workerId,
      onTaskRun(task) {
        state.lastLoopAt = new Date();
        state.lastError = null;
        logger.debug({ workerId, task }, "Graphile task started");
      },
    });
    const parsedCronItems = parseCronItems([
      {
        task: JOB_TASKS.auditSeal,
        match: "* * * * *",
        options: {
          queueName: JOB_TASKS.auditSeal,
          jobKey: `signalhub:cron:${JOB_TASKS.auditSeal}`,
          jobKeyMode: "replace",
          backfillPeriod: 0,
        },
      },
      {
        task: JOB_TASKS.retention,
        match: "0 * * * *",
        options: {
          queueName: JOB_TASKS.retention,
          jobKey: `signalhub:cron:${JOB_TASKS.retention}`,
          jobKeyMode: "replace",
          backfillPeriod: 0,
        },
      },
    ]);

    runner = await run({
      pgPool: postgresPool,
      taskList: tasks,
      parsedCronItems,
      concurrency: Number(process.env.WORKER_CONCURRENCY ?? 10),
      pollInterval: Number(process.env.WORKER_POLL_INTERVAL_MS ?? 1_000),
      gracefulShutdownAbortTimeout: Number(
        process.env.WORKER_SHUTDOWN_ABORT_TIMEOUT_MS ?? 15_000
      ),
      noHandleSignals: true,
      logger: graphileLogger,
    });

    runner.events.on("job:error", ({ job, error }) => {
      state.lastError = error instanceof Error ? error.message : "Graphile job failed";
      logger.error(
        { ...errorFields(error), workerId, graphileJobId: job.id },
        "Graphile job execution failed"
      );
    });
    runner.events.on("pool:fatalError", ({ error, action }) => {
      state.lastError = error instanceof Error ? error.message : "Graphile worker pool failed";
      logger.error(
        { ...errorFields(error), workerId, action },
        "Graphile worker pool encountered a fatal error"
      );
    });

    await seedContinuousTasks(runner);
    state.ready = true;
    await heartbeat("READY");
    logger.info(
      {
        workerId,
        concurrency: Number(process.env.WORKER_CONCURRENCY ?? 10),
        healthPort: port,
      },
      "SignalHub Graphile worker is ready"
    );

    heartbeatTimer = setInterval(() => {
      heartbeatUpdate = heartbeatUpdate
        .then(() => heartbeat("READY"))
        .catch((error) => {
          state.lastError = error instanceof Error ? error.message : "Worker heartbeat failed";
          logger.error({ ...errorFields(error), workerId }, "Worker heartbeat failed");
        });
    }, Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS ?? 5_000));
    heartbeatTimer.unref();

    let resolveStop!: (signal: string) => void;
    const stopRequested = new Promise<string>((resolve) => {
      resolveStop = resolve;
    });
    const requestStop = (signal: string) => {
      if (state.stopping) return;
      state.stopping = true;
      state.ready = false;
      logger.info({ workerId, signal }, "Worker shutdown requested");
      resolveStop(signal);
    };
    process.once("SIGTERM", () => requestStop("SIGTERM"));
    process.once("SIGINT", () => requestStop("SIGINT"));

    await Promise.race([
      stopRequested,
      runner.promise.then(() => {
        if (!state.stopping) throw new Error("Graphile runner stopped unexpectedly");
        return "runner-stopped";
      }),
    ]);
  } finally {
    state.stopping = true;
    state.ready = false;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    await heartbeatUpdate;
    await heartbeat("STOPPING").catch((error) => {
      logger.error({ ...errorFields(error), workerId }, "Failed to record stopping heartbeat");
    });
    await runner?.stop("SignalHub worker shutdown").catch((error) => {
      logger.error({ ...errorFields(error), workerId }, "Graphile worker shutdown failed");
    });
    await closeServer(server).catch((error) => {
      logger.error({ ...errorFields(error), workerId }, "Worker health server shutdown failed");
    });
    state.live = false;
    await closeDatabase();
    await stopTelemetry();
  }
}

main().catch((error) => {
  log("error", "Worker terminated", { error, workerId });
  process.exitCode = 1;
});

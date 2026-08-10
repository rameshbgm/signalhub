import type { JobHelpers, TaskList } from "graphile-worker";
import { JOB_TASKS, type SignalHubJobTask } from "@/lib/jobs";
import { sealAuditEntries } from "@/lib/audit-integrity";
import { runMaintenanceTransitions } from "@/lib/domain/maintenance";
import { runRetentionSweep } from "@/lib/retention";
import { drainAuditDeliveryJobs } from "@/worker/audit-delivery";
import { drainDataExportJobs } from "@/worker/exports";
import { runDueMonitors } from "@/worker/monitors";
import { drainNotificationJobs } from "@/worker/notifications";
import { drainPlatformJobs } from "@/worker/platform-jobs";

type TaskRuntime = {
  workerId: string;
  onTaskRun: (task: SignalHubJobTask) => void;
};

async function scheduleNext(
  task: SignalHubJobTask,
  delayMilliseconds: number,
  helpers: JobHelpers
) {
  await helpers.addJob(task, {}, {
    queueName: task,
    runAt: new Date(Date.now() + delayMilliseconds),
    maxAttempts: 25,
    jobKey: `signalhub:${task}`,
    jobKeyMode: "replace",
  });
}

function taskWorkerId(runtime: TaskRuntime, helpers: JobHelpers) {
  return `${runtime.workerId}:${helpers.job.locked_by ?? "graphile"}`;
}

export function signalHubTaskList(runtime: TaskRuntime): TaskList {
  return {
    [JOB_TASKS.monitors]: async (_payload, helpers) => {
      await scheduleNext(JOB_TASKS.monitors, Number(process.env.WORKER_MONITOR_SWEEP_MS ?? 1_000), helpers);
      runtime.onTaskRun(JOB_TASKS.monitors);
      await runDueMonitors(taskWorkerId(runtime, helpers), Number(process.env.WORKER_MONITOR_CONCURRENCY ?? 20));
    },
    [JOB_TASKS.notifications]: async (_payload, helpers) => {
      await scheduleNext(JOB_TASKS.notifications, Number(process.env.WORKER_NOTIFICATION_SWEEP_MS ?? 1_000), helpers);
      runtime.onTaskRun(JOB_TASKS.notifications);
      await drainNotificationJobs(taskWorkerId(runtime, helpers), Number(process.env.WORKER_NOTIFICATION_BATCH ?? 25));
    },
    [JOB_TASKS.exports]: async (_payload, helpers) => {
      await scheduleNext(JOB_TASKS.exports, Number(process.env.WORKER_EXPORT_SWEEP_MS ?? 5_000), helpers);
      runtime.onTaskRun(JOB_TASKS.exports);
      await drainDataExportJobs(taskWorkerId(runtime, helpers), 1);
    },
    [JOB_TASKS.auditDelivery]: async (_payload, helpers) => {
      await scheduleNext(JOB_TASKS.auditDelivery, Number(process.env.WORKER_AUDIT_DELIVERY_SWEEP_MS ?? 2_000), helpers);
      runtime.onTaskRun(JOB_TASKS.auditDelivery);
      await drainAuditDeliveryJobs(taskWorkerId(runtime, helpers), Number(process.env.WORKER_AUDIT_DELIVERY_BATCH ?? 25));
    },
    [JOB_TASKS.platformJobs]: async (_payload, helpers) => {
      await scheduleNext(JOB_TASKS.platformJobs, Number(process.env.WORKER_PLATFORM_JOB_SWEEP_MS ?? 5_000), helpers);
      runtime.onTaskRun(JOB_TASKS.platformJobs);
      await drainPlatformJobs(taskWorkerId(runtime, helpers), Number(process.env.WORKER_PLATFORM_JOB_BATCH ?? 1));
    },
    [JOB_TASKS.maintenance]: async (_payload, helpers) => {
      await scheduleNext(JOB_TASKS.maintenance, Number(process.env.WORKER_MAINTENANCE_SWEEP_MS ?? 10_000), helpers);
      runtime.onTaskRun(JOB_TASKS.maintenance);
      await runMaintenanceTransitions(new Date());
    },
    [JOB_TASKS.retention]: async () => {
      runtime.onTaskRun(JOB_TASKS.retention);
      await runRetentionSweep(runtime.workerId, new Date());
    },
    [JOB_TASKS.auditSeal]: async () => {
      runtime.onTaskRun(JOB_TASKS.auditSeal);
      await sealAuditEntries();
    },
  };
}

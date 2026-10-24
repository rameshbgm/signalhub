import { setting } from "@/lib/settings/effective";
import type { JobHelpers, TaskList } from "graphile-worker";
import { JOB_TASKS, type SignalHubJobTask } from "@/lib/jobs";
import { sealAuditEntries } from "@/lib/audit-integrity";
import { runMaintenanceTransitions } from "@/lib/domain/maintenance";
import { expireMfaState } from "@/lib/mfa/requests";
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
      await scheduleNext(JOB_TASKS.monitors, setting("workerMonitorSweepMs"), helpers);
      runtime.onTaskRun(JOB_TASKS.monitors);
      await runDueMonitors(taskWorkerId(runtime, helpers), setting("workerMonitorConcurrency"));
    },
    [JOB_TASKS.notifications]: async (_payload, helpers) => {
      await scheduleNext(JOB_TASKS.notifications, setting("workerNotificationSweepMs"), helpers);
      runtime.onTaskRun(JOB_TASKS.notifications);
      await drainNotificationJobs(taskWorkerId(runtime, helpers), setting("workerNotificationBatch"));
    },
    [JOB_TASKS.exports]: async (_payload, helpers) => {
      await scheduleNext(JOB_TASKS.exports, setting("workerExportSweepMs"), helpers);
      runtime.onTaskRun(JOB_TASKS.exports);
      await drainDataExportJobs(taskWorkerId(runtime, helpers), 1);
    },
    [JOB_TASKS.auditDelivery]: async (_payload, helpers) => {
      await scheduleNext(JOB_TASKS.auditDelivery, setting("workerAuditDeliverySweepMs"), helpers);
      runtime.onTaskRun(JOB_TASKS.auditDelivery);
      await drainAuditDeliveryJobs(taskWorkerId(runtime, helpers), setting("workerAuditDeliveryBatch"));
    },
    [JOB_TASKS.platformJobs]: async (_payload, helpers) => {
      await scheduleNext(JOB_TASKS.platformJobs, setting("workerPlatformJobSweepMs"), helpers);
      runtime.onTaskRun(JOB_TASKS.platformJobs);
      await drainPlatformJobs(taskWorkerId(runtime, helpers), setting("workerPlatformJobBatch"));
    },
    [JOB_TASKS.maintenance]: async (_payload, helpers) => {
      await scheduleNext(JOB_TASKS.maintenance, setting("workerMaintenanceSweepMs"), helpers);
      runtime.onTaskRun(JOB_TASKS.maintenance);
      await runMaintenanceTransitions(new Date());
      // ponytail: rides the maintenance sweep (cheap indexed updates) instead of a task of its own.
      await expireMfaState(new Date());
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

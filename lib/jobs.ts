import { sql } from "kysely";
import type { DatabaseExecutor } from "@/lib/postgres/client";

export const JOB_TASKS = {
  monitors: "signalhub_monitor_sweep",
  notifications: "signalhub_notification_sweep",
  exports: "signalhub_export_sweep",
  auditDelivery: "signalhub_audit_delivery_sweep",
  platformJobs: "signalhub_platform_job_sweep",
  maintenance: "signalhub_maintenance",
  retention: "signalhub_retention",
  auditSeal: "signalhub_audit_seal",
} as const;

export type SignalHubJobTask = (typeof JOB_TASKS)[keyof typeof JOB_TASKS];

/**
 * Atomically nudges a stable Graphile task from an existing application
 * transaction. Replacing an available job brings it forward; replacing a
 * locked job creates a successor, so a state change is never lost.
 */
export async function enqueueJobSweep(
  executor: DatabaseExecutor,
  task: SignalHubJobTask,
  runAt = new Date()
) {
  await sql`
    select graphile_worker.add_job(
      identifier := ${task},
      payload := '{}'::json,
      queue_name := ${task},
      run_at := ${runAt},
      max_attempts := 25,
      job_key := ${`signalhub:${task}`},
      priority := 0,
      job_key_mode := 'replace'
    )
  `.execute(executor);
}

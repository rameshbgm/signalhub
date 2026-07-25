import type { PlatformJobDoc } from "@/lib/db";

type PurgeCancellationState = Pick<
  PlatformJobDoc,
  "type" | "status" | "attempts" | "startedAt"
>;

/**
 * A tenant purge is reversible only before a worker has ever leased it.
 * Retried and failed jobs may already have removed tenant data, even when
 * their current status has returned to QUEUED.
 */
export function organizationPurgeCanBeCancelled(
  job: PurgeCancellationState | null | undefined
) {
  return (
    job?.type === "PURGE_ORGANIZATION" &&
    job.status === "QUEUED" &&
    job.attempts === 0 &&
    job.startedAt == null
  );
}

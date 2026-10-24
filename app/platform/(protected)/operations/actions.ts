"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { withDatabaseTransaction } from "@/lib/postgres/client";
import { writePlatformAudit } from "@/lib/platform-policy";
import { enqueueJobSweep, JOB_TASKS } from "@/lib/jobs";

export type RetryResult = { done: number; failed: Array<{ id: string; message: string }> };
const MAX_BATCH = 100;

type Actor = Awaited<ReturnType<typeof requirePlatformCapability>>;

async function retryDelivery(actor: Actor, jobId: string) {
  await withDatabaseTransaction(async (transaction) => {
    const now = new Date();
    const job = await transaction.updateTable("notificationJobs").set({
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: null,
      responseStatus: null,
      sentAt: null,
      updatedAt: now,
    }).where("id", "=", jobId).where("status", "=", "DEAD_LETTER")
      .returning(["id", "channel", "pageId"]).executeTakeFirst();
    if (!job) throw new Error("Dead-letter delivery not found or its state changed");
    await writePlatformAudit({
      actorId: actor.platformAdminId,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "NOTIFICATION_DELIVERY_RETRIED",
      targetType: "notificationJob",
      targetId: job.id,
      metadata: { channel: job.channel, pageId: job.pageId },
    }, { executor: transaction });
    await enqueueJobSweep(transaction, JOB_TASKS.notifications);
  });
}

async function retryJob(actor: Actor, jobId: string) {
  await withDatabaseTransaction(async (transaction) => {
    const now = new Date();
    const job = await transaction.updateTable("platformJobs").set({
      status: "QUEUED",
      attempts: 0,
      nextAttemptAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: null,
      updatedAt: now,
    }).where("id", "=", jobId).where("status", "=", "FAILED")
      .where((expression) => expression("attempts", ">=", expression.ref("maxAttempts")))
      .returning(["id", "organizationId"]).executeTakeFirst();
    if (!job) throw new Error("Failed job not found or its state changed");
    await writePlatformAudit({
      actorId: actor.platformAdminId,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "PLATFORM_JOB_RETRIED",
      targetType: "platformJob",
      targetId: job.id,
      organizationId: job.organizationId,
    }, { executor: transaction });
    await enqueueJobSweep(transaction, JOB_TASKS.platformJobs);
  });
}

/** Retry one or many dead-letter deliveries or failed platform jobs. Each is its own transaction; failures are reported per item. */
export async function retryOperations(kind: "delivery" | "job", ids: string[]): Promise<RetryResult> {
  if (kind !== "delivery" && kind !== "job") throw new Error("Unknown operation");
  const actor = await requirePlatformCapability("operations.retry");
  const unique = [...new Set(ids)];
  if (unique.length === 0) throw new Error("Select at least one item");
  if (unique.length > MAX_BATCH) throw new Error(`Select at most ${MAX_BATCH} items at a time`);
  const result: RetryResult = { done: 0, failed: [] };
  for (const id of unique) {
    try {
      await (kind === "delivery" ? retryDelivery : retryJob)(actor, id);
      result.done += 1;
    } catch (error) {
      unstable_rethrow(error);
      result.failed.push({ id, message: error instanceof Error && error.message.length <= 200 ? error.message : "Could not be retried" });
    }
  }
  revalidatePath("/organization/platform/operations");
  return result;
}

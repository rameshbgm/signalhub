"use server";

import { sql } from "kysely";
import { revalidatePath } from "next/cache";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { withDatabaseTransaction } from "@/lib/postgres/client";
import { writePlatformAudit } from "@/lib/platform-policy";
import { RETENTION_BOUNDS, type EffectiveRetention } from "@/lib/retention";
import { enqueueJobSweep, JOB_TASKS } from "@/lib/jobs";

export async function retryNotificationDelivery(jobId: string, formData: FormData) {
  const actor = await requirePlatformCapability("operations.retry");
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 10) throw new Error("Enter a specific retry reason");
  if (reason.length > 2_000) throw new Error("Reason must not exceed 2000 characters");
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
      reason,
      metadata: { channel: job.channel, pageId: job.pageId },
    }, { executor: transaction });
    await enqueueJobSweep(transaction, JOB_TASKS.notifications);
  });
  revalidatePath("/organization/platform/operations");
}

export async function updatePlatformRetention(formData: FormData) {
  const actor = await requirePlatformCapability("operations.retry");
  const values = Object.fromEntries(
    Object.entries(RETENTION_BOUNDS).map(([key, bounds]) => {
      const value = Number(formData.get(key));
      if (!Number.isInteger(value) || value < bounds.min || value > bounds.max) {
        throw new Error(`${key} must be between ${bounds.min} and ${bounds.max} days`);
      }
      return [key, value];
    })
  ) as EffectiveRetention;
  await withDatabaseTransaction(async (transaction) => {
    await sql`select pg_advisory_xact_lock(hashtext('signalhub:platform-retention'))`.execute(transaction);
    const existing = await transaction.selectFrom("retentionPolicies").select("id")
      .where("orgId", "is", null).executeTakeFirst();
    if (existing) {
      await transaction.updateTable("retentionPolicies").set({
        ...values,
        updatedAt: new Date(),
        updatedBy: actor.platformAdminId,
      }).where("id", "=", existing.id).execute();
    } else {
      await transaction.insertInto("retentionPolicies").values({
        orgId: null,
        ...values,
        updatedBy: actor.platformAdminId,
      }).execute();
    }
    await writePlatformAudit({
      actorId: actor.platformAdminId,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "PLATFORM_RETENTION_UPDATED",
      targetType: "retentionPolicy",
      targetId: "platform-default",
      metadata: values,
    }, { executor: transaction });
  });
  revalidatePath("/organization/platform/operations");
}

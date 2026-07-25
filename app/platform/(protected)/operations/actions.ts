"use server";

import { revalidatePath } from "next/cache";
import { collections, mongoClient } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { writePlatformAudit } from "@/lib/platform-policy";
import { ObjectId } from "mongodb";
import { RETENTION_BOUNDS } from "@/lib/retention";

export async function retryNotificationDelivery(jobId: string, formData: FormData) {
  const actor = await requirePlatformCapability("operations.retry");
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 10) throw new Error("Enter a specific retry reason");
  if (reason.length > 2_000) throw new Error("Reason must not exceed 2000 characters");
  const databaseSession = mongoClient.startSession();
  try {
    await databaseSession.withTransaction(async () => {
      const job = await collections.notificationJobs().findOne(
        {
          _id: oid(jobId),
          status: "DEAD_LETTER",
        },
        { session: databaseSession }
      );
      if (!job) throw new Error("Dead-letter delivery not found");
      const now = new Date();
      const changed = await collections.notificationJobs().updateOne(
        { _id: job._id, status: "DEAD_LETTER" },
        {
          $set: {
            status: "PENDING",
            attempts: 0,
            nextAttemptAt: now,
            leaseOwner: null,
            leaseExpiresAt: null,
            lastError: null,
            responseStatus: null,
            sentAt: null,
            updatedAt: now,
          },
        },
        { session: databaseSession }
      );
      if (!changed.modifiedCount) {
        throw new Error("Delivery state changed; reload and retry");
      }
      await writePlatformAudit(
        {
          actorId: oid(actor.platformAdminId),
          actorEmail: actor.email,
          actorRole: actor.role,
          action: "NOTIFICATION_DELIVERY_RETRIED",
          targetType: "notificationJob",
          targetId: job._id.toHexString(),
          reason,
          metadata: {
            channel: job.channel,
            pageId: job.pageId.toHexString(),
          },
        },
        { session: databaseSession }
      );
    });
  } finally {
    await databaseSession.endSession();
  }
  revalidatePath("/platform/operations");
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
  );
  const now = new Date();
  await collections.retentionPolicies().updateOne(
    { orgId: null },
    {
      $set: { ...values, updatedAt: now, updatedBy: oid(actor.platformAdminId) },
      $setOnInsert: { _id: new ObjectId(), orgId: null, createdAt: now },
    },
    { upsert: true }
  );
  await writePlatformAudit({
    actorId: oid(actor.platformAdminId),
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "PLATFORM_RETENTION_UPDATED",
    targetType: "retentionPolicy",
    targetId: "platform-default",
    metadata: values,
  });
  revalidatePath("/platform/operations");
}

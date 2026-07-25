"use server";

import { revalidatePath } from "next/cache";
import { oid } from "@/lib/mongo-utils";
import { collections, mongoClient } from "@/lib/db";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { writePlatformAudit } from "@/lib/platform-policy";

function reasonFrom(formData: FormData) {
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 10) throw new Error("Enter a specific reason containing at least 10 characters");
  if (reason.length > 2_000) throw new Error("Reason must not exceed 2000 characters");
  return reason;
}

export async function disableUser(userId: string, formData: FormData) {
  const actor = await requirePlatformCapability("users.disable");
  const reason = reasonFrom(formData);
  const databaseSession = mongoClient.startSession();
  try {
    await databaseSession.withTransaction(async () => {
      const user = await collections.users().findOne(
        { _id: oid(userId) },
        { session: databaseSession }
      );
      if (!user) throw new Error("User not found");
      if (user.disabled) {
        throw new Error("User is already disabled; reload and retry");
      }
      const now = new Date();
      const changed = await collections.users().updateOne(
        { _id: user._id, disabled: { $ne: true } },
        { $set: { disabled: true, updatedAt: now } },
        { session: databaseSession }
      );
      if (!changed.modifiedCount) {
        throw new Error("User state changed; reload and retry");
      }
      await collections.authSessions().updateMany(
        { userId: user._id, revokedAt: null },
        { $set: { revokedAt: now, revokedReason: "user-disabled" } },
        { session: databaseSession }
      );
      await writePlatformAudit(
        {
          actorId: oid(actor.platformAdminId),
          actorEmail: actor.email,
          actorRole: actor.role,
          action: "GLOBAL_USER_DISABLED",
          targetType: "user",
          targetId: user._id.toHexString(),
          reason,
          metadata: { email: user.email },
        },
        { session: databaseSession }
      );
    });
  } finally {
    await databaseSession.endSession();
  }
  revalidatePath("/platform/users");
}

export async function reactivateUser(userId: string, formData: FormData) {
  const actor = await requirePlatformCapability("users.disable");
  const reason = reasonFrom(formData);
  const databaseSession = mongoClient.startSession();
  try {
    await databaseSession.withTransaction(async () => {
      const user = await collections.users().findOne(
        { _id: oid(userId) },
        { session: databaseSession }
      );
      if (!user) throw new Error("User not found");
      if (!user.disabled) {
        throw new Error("User is already active; reload and retry");
      }
      const now = new Date();
      const changed = await collections.users().updateOne(
        { _id: user._id, disabled: true },
        { $set: { disabled: false, updatedAt: now } },
        { session: databaseSession }
      );
      if (!changed.modifiedCount) {
        throw new Error("User state changed; reload and retry");
      }
      await writePlatformAudit(
        {
          actorId: oid(actor.platformAdminId),
          actorEmail: actor.email,
          actorRole: actor.role,
          action: "GLOBAL_USER_REACTIVATED",
          targetType: "user",
          targetId: user._id.toHexString(),
          reason,
          metadata: { email: user.email },
        },
        { session: databaseSession }
      );
    });
  } finally {
    await databaseSession.endSession();
  }
  revalidatePath("/platform/users");
}

"use server";

import { revalidatePath } from "next/cache";
import { oid } from "@/lib/mongo-utils";
import { collections } from "@/lib/db";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { writePlatformAudit } from "@/lib/platform-policy";
import { withOrganizationAdminInvariantTransaction } from "@/lib/team-owner-safety";

function reasonFrom(formData: FormData) {
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 10) throw new Error("Enter a specific reason containing at least 10 characters");
  if (reason.length > 2_000) throw new Error("Reason must not exceed 2000 characters");
  return reason;
}

export async function disableUser(userId: string, formData: FormData) {
  const actor = await requirePlatformCapability("users.disable");
  const reason = reasonFrom(formData);
  await withOrganizationAdminInvariantTransaction("global", async (databaseSession) => {
      const user = await collections.users().findOne(
        { _id: oid(userId) },
        { session: databaseSession }
      );
      if (!user) throw new Error("User not found");
      if (user.disabled) {
        throw new Error("User is already disabled; reload and retry");
      }
      const adminMemberships = await collections.memberships().find(
        { role: "ADMIN", status: "ACTIVE" },
        { session: databaseSession, projection: { userId: 1 } }
      ).toArray();
      const activeAdminIds = [...new Map(adminMemberships.map((membership) => [membership.userId.toHexString(), membership.userId])).values()];
      if (activeAdminIds.some((id) => id.equals(user._id))) {
        const otherActiveAdmins = await collections.users().countDocuments(
          { _id: { $in: activeAdminIds.filter((id) => !id.equals(user._id)) }, disabled: { $ne: true } },
          { session: databaseSession }
        );
        if (otherActiveAdmins === 0) throw new Error("The last active Admin cannot be disabled");
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
  revalidatePath("/organization/platform/users");
}

export async function reactivateUser(userId: string, formData: FormData) {
  const actor = await requirePlatformCapability("users.disable");
  const reason = reasonFrom(formData);
  await withOrganizationAdminInvariantTransaction("global", async (databaseSession) => {
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
  revalidatePath("/organization/platform/users");
}

"use server";

import { revalidatePath } from "next/cache";
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
  await withOrganizationAdminInvariantTransaction("global", async (transaction) => {
    const user = await transaction.selectFrom("users").selectAll()
      .where("id", "=", userId).forUpdate().executeTakeFirst();
    if (!user) throw new Error("User not found");
    if (user.disabled) throw new Error("User is already disabled; reload and retry");

    const activeAdminMembership = await transaction.selectFrom("memberships")
      .select("id").where("userId", "=", user.id)
      .where("role", "=", "ADMIN").where("status", "=", "ACTIVE")
      .executeTakeFirst();
    if (activeAdminMembership) {
      const otherAdmin = await transaction.selectFrom("memberships")
        .innerJoin("users", "users.id", "memberships.userId")
        .select("memberships.id")
        .where("memberships.role", "=", "ADMIN")
        .where("memberships.status", "=", "ACTIVE")
        .where("users.disabled", "=", false)
        .where("users.id", "!=", user.id)
        .executeTakeFirst();
      if (!otherAdmin) throw new Error("The last active Admin cannot be disabled");
    }

    const now = new Date();
    const changed = await transaction.updateTable("users")
      .set({ disabled: true, updatedAt: now })
      .where("id", "=", user.id).where("disabled", "=", false)
      .returning("id").executeTakeFirst();
    if (!changed) throw new Error("User state changed; reload and retry");
    await transaction.updateTable("authSessions")
      .set({ revokedAt: now, revokedReason: "user-disabled" })
      .where("userId", "=", user.id).where("revokedAt", "is", null).execute();
    await writePlatformAudit({
      actorId: actor.platformAdminId,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "GLOBAL_USER_DISABLED",
      targetType: "user",
      targetId: user.id,
      reason,
      metadata: { email: user.email },
    }, { executor: transaction });
  });
  revalidatePath("/organization/platform/users");
}

export async function reactivateUser(userId: string, formData: FormData) {
  const actor = await requirePlatformCapability("users.disable");
  const reason = reasonFrom(formData);
  await withOrganizationAdminInvariantTransaction("global", async (transaction) => {
    const user = await transaction.updateTable("users")
      .set({ disabled: false, updatedAt: new Date() })
      .where("id", "=", userId).where("disabled", "=", true)
      .returning(["id", "email"]).executeTakeFirst();
    if (!user) throw new Error("User not found or is already active; reload and retry");
    await writePlatformAudit({
      actorId: actor.platformAdminId,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "GLOBAL_USER_REACTIVATED",
      targetType: "user",
      targetId: user.id,
      reason,
      metadata: { email: user.email },
    }, { executor: transaction });
  });
  revalidatePath("/organization/platform/users");
}

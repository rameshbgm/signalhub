"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { DESTINATION_CHANNELS, type DestinationChannel } from "@/lib/notification-providers";
import { writePlatformAudit } from "@/lib/platform-policy";
import { withDatabaseTransaction } from "@/lib/postgres/client";

export async function updatePlatformConfiguration(formData: FormData) {
  const actor = await requirePlatformCapability("configuration.manage");
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 10) throw new Error("Enter a specific change reason");
  if (reason.length > 2_000) throw new Error("Reason must not exceed 2000 characters");
  const submitted = new Set(formData.getAll("enabledDestinationChannels").map(String));
  const enabledDestinationChannels = DESTINATION_CHANNELS.filter((channel) => submitted.has(channel)) satisfies DestinationChannel[];
  const now = new Date();
  await withDatabaseTransaction(async (transaction) => {
    await transaction.insertInto("platformConfiguration").values({
      id: "global", enabledDestinationChannels, updatedBy: actor.platformAdminId, updatedAt: now,
    }).onConflict((conflict) => conflict.column("id").doUpdateSet({
      enabledDestinationChannels, updatedBy: actor.platformAdminId, updatedAt: now,
    })).execute();
    await writePlatformAudit({
      actorId: actor.platformAdminId, actorEmail: actor.email, actorRole: actor.role,
      action: "PLATFORM_CONFIGURATION_UPDATED", targetType: "platformConfiguration",
      targetId: "global", reason, metadata: { enabledDestinationChannels },
    }, { executor: transaction });
  });
  revalidatePath("/organization/platform/configuration");
  revalidatePath("/organization/notifications");
}

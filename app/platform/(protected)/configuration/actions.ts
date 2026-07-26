"use server";

import { revalidatePath } from "next/cache";
import { collections, mongoClient } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { writePlatformAudit } from "@/lib/platform-policy";
import {
  DESTINATION_CHANNELS,
  type DestinationChannel,
} from "@/lib/notification-providers";

export async function updatePlatformConfiguration(formData: FormData) {
  const actor = await requirePlatformCapability("configuration.manage");
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 10) throw new Error("Enter a specific change reason");
  if (reason.length > 2_000) throw new Error("Reason must not exceed 2000 characters");

  const submitted = new Set(
    formData.getAll("enabledDestinationChannels").map((value) => String(value))
  );
  const enabledDestinationChannels = DESTINATION_CHANNELS.filter((channel) =>
    submitted.has(channel)
  ) satisfies DestinationChannel[];
  const now = new Date();
  const databaseSession = mongoClient.startSession();

  try {
    await databaseSession.withTransaction(async () => {
      await collections.platformConfiguration().updateOne(
        { _id: "global" },
        {
          $set: {
            enabledDestinationChannels,
            updatedBy: oid(actor.platformAdminId),
            updatedAt: now,
          },
        },
        { upsert: true, session: databaseSession }
      );
      await writePlatformAudit(
        {
          actorId: oid(actor.platformAdminId),
          actorEmail: actor.email,
          actorRole: actor.role,
          action: "PLATFORM_CONFIGURATION_UPDATED",
          targetType: "platformConfiguration",
          targetId: "global",
          reason,
          metadata: { enabledDestinationChannels },
        },
        { session: databaseSession }
      );
    });
  } finally {
    await databaseSession.endSession();
  }

  revalidatePath("/organization/platform/configuration");
  revalidatePath("/organization/notifications");
}

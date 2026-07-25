"use server";

import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { collections, mongoClient } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { writePlatformAudit } from "@/lib/platform-policy";
import {
  MONITOR_TYPES,
  normalizeMonitorConfiguration,
} from "@/lib/monitor-validation";
import { validateMonitorTarget } from "@/lib/monitor-target-validation";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().min(2).max(500),
  type: z.enum(MONITOR_TYPES),
  target: z.string().trim().max(2_000),
  port: z.number().int().min(1).max(65_535).nullable(),
  expectedStatusRange: z.string().trim().max(7),
  keywordMatch: z.string().trim().max(500).nullable(),
  enabled: z.boolean(),
});

async function input(formData: FormData) {
  const portValue = String(formData.get("port") ?? "").trim();
  const parsed = schema.parse({
    name: formData.get("name"),
    category: formData.get("category"),
    description: formData.get("description"),
    type: formData.get("type"),
    target: formData.get("target"),
    port: portValue ? Number(portValue) : null,
    expectedStatusRange: formData.get("expectedStatusRange"),
    keywordMatch: String(formData.get("keywordMatch") ?? "").trim() || null,
    enabled: formData.get("enabled") === "on",
  });
  const values = normalizeMonitorConfiguration(parsed);
  await validateMonitorTarget(
    values,
    process.env.MONITOR_ALLOW_PRIVATE_TARGETS === "true"
  );
  return values;
}

function reason(formData: FormData) {
  const value = String(formData.get("reason") ?? "").trim();
  if (value.length < 10) throw new Error("Enter a specific change reason");
  if (value.length > 2_000) throw new Error("Reason must not exceed 2000 characters");
  return value;
}

export async function saveMonitorTemplate(templateId: string | null, formData: FormData) {
  const actor = await requirePlatformCapability("templates.manage");
  const values = await input(formData);
  const changeReason = reason(formData);
  const id = templateId ? oid(templateId) : new ObjectId();
  const databaseSession = mongoClient.startSession();
  try {
    await databaseSession.withTransaction(async () => {
      if (templateId) {
        const existing = await collections.monitorTemplates().findOne(
          { _id: id },
          { session: databaseSession }
        );
        if (!existing) throw new Error("Monitor template not found");
        await collections.monitorTemplates().updateOne(
          { _id: id },
          { $set: values },
          { session: databaseSession }
        );
      } else {
        await collections
          .monitorTemplates()
          .insertOne({ _id: id, ...values }, { session: databaseSession });
      }
      await writePlatformAudit(
        {
          actorId: oid(actor.platformAdminId),
          actorEmail: actor.email,
          actorRole: actor.role,
          action: templateId
            ? "MONITOR_TEMPLATE_UPDATED"
            : "MONITOR_TEMPLATE_CREATED",
          targetType: "monitorTemplate",
          targetId: id.toHexString(),
          reason: changeReason,
          metadata: { name: values.name, type: values.type },
        },
        { session: databaseSession }
      );
    });
  } finally {
    await databaseSession.endSession();
  }
  revalidatePath("/platform/templates");
}

export async function deleteMonitorTemplate(templateId: string, formData: FormData) {
  const actor = await requirePlatformCapability("templates.manage");
  const changeReason = reason(formData);
  const databaseSession = mongoClient.startSession();
  try {
    await databaseSession.withTransaction(async () => {
      const template = await collections.monitorTemplates().findOne(
        { _id: oid(templateId) },
        { session: databaseSession }
      );
      if (!template) throw new Error("Monitor template not found");
      const deleted = await collections.monitorTemplates().deleteOne(
        { _id: template._id },
        { session: databaseSession }
      );
      if (!deleted.deletedCount) {
        throw new Error("Monitor template state changed; reload and retry");
      }
      await writePlatformAudit(
        {
          actorId: oid(actor.platformAdminId),
          actorEmail: actor.email,
          actorRole: actor.role,
          action: "MONITOR_TEMPLATE_DELETED",
          targetType: "monitorTemplate",
          targetId: template._id.toHexString(),
          reason: changeReason,
          metadata: { name: template.name, type: template.type },
        },
        { session: databaseSession }
      );
    });
  } finally {
    await databaseSession.endSession();
  }
  revalidatePath("/platform/templates");
}

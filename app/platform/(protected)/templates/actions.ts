"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { withDatabaseTransaction } from "@/lib/postgres/client";
import { writePlatformAudit } from "@/lib/platform-policy";
import { MONITOR_TYPES, normalizeMonitorConfiguration } from "@/lib/monitor-validation";
import { validateMonitorTarget } from "@/lib/monitor-target-validation";
import { enqueueJobSweep, JOB_TASKS } from "@/lib/jobs";

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
  await validateMonitorTarget(values, process.env.MONITOR_ALLOW_PRIVATE_TARGETS === "true");
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
  await withDatabaseTransaction(async (transaction) => {
    let id: string;
    if (templateId) {
      const template = await transaction.updateTable("monitorTemplates").set(values)
        .where("id", "=", templateId).returning("id").executeTakeFirst();
      if (!template) throw new Error("Monitor template not found");
      id = template.id;
      await transaction.updateTable("monitors").set({
        name: values.name,
        type: values.type,
        target: values.type === "HEARTBEAT" ? "inbound-heartbeat" : values.target,
        port: values.port,
        expectedStatusRange: values.expectedStatusRange,
        keywordMatch: values.keywordMatch,
        groupName: values.category,
        enabled: values.enabled,
        runRequestedAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
      }).where("templateId", "=", templateId).execute();
      await enqueueJobSweep(transaction, JOB_TASKS.monitors);
    } else {
      const template = await transaction.insertInto("monitorTemplates").values(values)
        .returning("id").executeTakeFirstOrThrow();
      id = template.id;
    }
    await writePlatformAudit({
      actorId: actor.platformAdminId,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: templateId ? "MONITOR_TEMPLATE_UPDATED" : "MONITOR_TEMPLATE_CREATED",
      targetType: "monitorTemplate",
      targetId: id,
      reason: changeReason,
      metadata: { name: values.name, type: values.type },
    }, { executor: transaction });
  });
  revalidatePath("/organization/platform/templates");
}

export async function deleteMonitorTemplate(templateId: string, formData: FormData) {
  const actor = await requirePlatformCapability("templates.manage");
  const changeReason = reason(formData);
  await withDatabaseTransaction(async (transaction) => {
    const template = await transaction.selectFrom("monitorTemplates").selectAll()
      .where("id", "=", templateId).forUpdate().executeTakeFirst();
    if (!template) throw new Error("Monitor template not found");
    const attached = await transaction.selectFrom("monitors")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("templateId", "=", template.id).executeTakeFirstOrThrow();
    const count = Number(attached.count);
    if (count) {
      throw new Error(`Remove this template from ${count} page${count === 1 ? "" : "s"} before deleting the global master`);
    }
    await transaction.deleteFrom("monitorTemplates").where("id", "=", template.id).execute();
    await writePlatformAudit({
      actorId: actor.platformAdminId,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "MONITOR_TEMPLATE_DELETED",
      targetType: "monitorTemplate",
      targetId: template.id,
      reason: changeReason,
      metadata: { name: template.name, type: template.type },
    }, { executor: transaction });
  });
  revalidatePath("/organization/platform/templates");
}

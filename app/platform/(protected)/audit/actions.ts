"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { encryptSecret } from "@/lib/encryption";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import { writePlatformAudit } from "@/lib/platform-policy";

export async function createAuditSink(formData: FormData) {
  const actor = await requirePlatformCapability("audit.manage");
  const name = String(formData.get("name") ?? "").trim();
  const urlValue = String(formData.get("url") ?? "").trim();
  const secret = String(formData.get("secret") ?? "");
  const orgId = String(formData.get("orgId") ?? "").trim() || null;
  if (!name || name.length > 120) throw new Error("Enter a sink name");
  const url = new URL(urlValue);
  if (url.protocol !== "https:" && process.env.ALLOW_INSECURE_AUDIT_SINKS !== "true") {
    throw new Error("Audit sinks must use HTTPS");
  }
  if (secret.length < 32) throw new Error("Webhook signing secret must contain at least 32 characters");
  if (orgId) {
    const organization = await database.selectFrom("organizations").select("id")
      .where("id", "=", orgId).executeTakeFirst();
    if (!organization) throw new Error("Organization not found");
  }
  await withDatabaseTransaction(async (transaction) => {
    const sink = await transaction.insertInto("auditSinks").values({
      name,
      orgId,
      url: url.toString(),
      secretCiphertext: encryptSecret(secret),
      enabled: true,
      createdBy: actor.platformAdminId,
    }).returning("id").executeTakeFirstOrThrow();
    await writePlatformAudit({
      actorId: actor.platformAdminId,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "AUDIT_SINK_CREATED",
      targetType: "auditSink",
      targetId: sink.id,
      organizationId: orgId,
      metadata: { name, host: url.host },
    }, { executor: transaction });
  });
  revalidatePath("/organization/platform/audit");
}

export async function setAuditSinkEnabled(id: string, formData: FormData) {
  const actor = await requirePlatformCapability("audit.manage");
  const enabled = String(formData.get("enabled")) === "true";
  await withDatabaseTransaction(async (transaction) => {
    const sink = await transaction.updateTable("auditSinks")
      .set({ enabled, updatedAt: new Date() }).where("id", "=", id)
      .returning(["id", "orgId"]).executeTakeFirst();
    if (!sink) throw new Error("Audit sink not found");
    await writePlatformAudit({
      actorId: actor.platformAdminId,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: enabled ? "AUDIT_SINK_ENABLED" : "AUDIT_SINK_DISABLED",
      targetType: "auditSink",
      targetId: sink.id,
      organizationId: sink.orgId,
    }, { executor: transaction });
  });
  revalidatePath("/organization/platform/audit");
}

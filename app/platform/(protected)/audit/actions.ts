"use server";

import { validateHttpTarget } from "@/lib/target-validation";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { isDatabaseId } from "@/lib/database-id";
import { encryptSecret } from "@/lib/encryption";
import { INPUT_LIMITS } from "@/lib/input-limits";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import { writePlatformAudit } from "@/lib/platform-policy";

export async function createAuditSink(formData: FormData) {
  const actor = await requirePlatformCapability("audit.manage");
  const name = String(formData.get("name") ?? "").trim();
  const urlValue = String(formData.get("url") ?? "").trim();
  const secret = String(formData.get("secret") ?? "");
  const orgId = String(formData.get("orgId") ?? "").trim() || null;
  if (!name || name.length > 120) throw new Error("Enter a sink name");
  if (!URL.canParse(urlValue) || urlValue.length > INPUT_LIMITS.url) throw new Error(`Enter a full HTTPS URL of at most ${INPUT_LIMITS.url} characters`);
  const url = await validateHttpTarget(urlValue, { httpsOnly: process.env.ALLOW_INSECURE_AUDIT_SINKS !== "true", allowPrivate: false });
  if (secret.length < 32) throw new Error("Webhook signing secret must contain at least 32 characters");
  if (secret.length > INPUT_LIMITS.secret) throw new Error(`Webhook signing secret must be ${INPUT_LIMITS.secret} characters or fewer`);
  if (orgId && !isDatabaseId(orgId)) throw new Error("Organization not found");
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

export type SinkToggleResult = { done: number; failed: Array<{ id: string; message: string }> };

/** Enables or disables one or many sinks. Each is its own transaction; failures are reported per sink. */
export async function setAuditSinksEnabled(ids: string[], enabled: boolean): Promise<SinkToggleResult> {
  const actor = await requirePlatformCapability("audit.manage");
  const unique = [...new Set(ids)];
  if (unique.length === 0) throw new Error("Select at least one sink");
  if (unique.length > 100) throw new Error("Select at most 100 sinks at a time");
  const result: SinkToggleResult = { done: 0, failed: [] };
  for (const id of unique) {
    try {
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
      result.done += 1;
    } catch (error) {
      unstable_rethrow(error);
      result.failed.push({ id, message: error instanceof Error && error.message.length <= 200 ? error.message : "Could not be changed" });
    }
  }
  revalidatePath("/organization/platform/audit");
  return result;
}

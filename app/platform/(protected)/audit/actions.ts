"use server";

import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { collections } from "@/lib/db";
import { encryptSecret } from "@/lib/encryption";
import { oid } from "@/lib/mongo-utils";
import { writePlatformAudit } from "@/lib/platform-policy";

export async function createAuditSink(formData: FormData) {
  const actor = await requirePlatformCapability("audit.manage");
  const name = String(formData.get("name") ?? "").trim();
  const urlValue = String(formData.get("url") ?? "").trim();
  const secret = String(formData.get("secret") ?? "");
  const orgIdValue = String(formData.get("orgId") ?? "").trim();
  if (!name || name.length > 120) throw new Error("Enter a sink name");
  const url = new URL(urlValue);
  if (url.protocol !== "https:" && process.env.ALLOW_INSECURE_AUDIT_SINKS !== "true") {
    throw new Error("Audit sinks must use HTTPS");
  }
  if (secret.length < 32) throw new Error("Webhook signing secret must contain at least 32 characters");
  const orgId = orgIdValue ? oid(orgIdValue) : null;
  if (orgId && !(await collections.organizations().findOne({ _id: orgId }))) {
    throw new Error("Organization not found");
  }
  const now = new Date();
  const id = new ObjectId();
  await collections.auditSinks().insertOne({
    _id: id,
    name,
    orgId,
    url: url.toString(),
    secretCiphertext: encryptSecret(secret),
    enabled: true,
    createdBy: oid(actor.platformAdminId),
    createdAt: now,
    updatedAt: now,
  });
  await writePlatformAudit({
    actorId: oid(actor.platformAdminId),
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "AUDIT_SINK_CREATED",
    targetType: "auditSink",
    targetId: id.toHexString(),
    organizationId: orgId,
    metadata: { name, host: url.host },
  });
  revalidatePath("/platform/audit");
}

export async function setAuditSinkEnabled(id: string, formData: FormData) {
  const actor = await requirePlatformCapability("audit.manage");
  const enabled = String(formData.get("enabled")) === "true";
  const sink = await collections.auditSinks().findOne({ _id: oid(id) });
  if (!sink) throw new Error("Audit sink not found");
  await collections.auditSinks().updateOne(
    { _id: sink._id },
    { $set: { enabled, updatedAt: new Date() } }
  );
  await writePlatformAudit({
    actorId: oid(actor.platformAdminId),
    actorEmail: actor.email,
    actorRole: actor.role,
    action: enabled ? "AUDIT_SINK_ENABLED" : "AUDIT_SINK_DISABLED",
    targetType: "auditSink",
    targetId: sink._id.toHexString(),
    organizationId: sink.orgId,
  });
  revalidatePath("/platform/audit");
}

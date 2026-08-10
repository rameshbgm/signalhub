"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/admin-guard";
import { writeActiveTenantAudit } from "@/lib/tenant-audit";
import { RETENTION_BOUNDS, type EffectiveRetention } from "@/lib/retention";
import { enqueueJobSweep, JOB_TASKS } from "@/lib/jobs";

export async function updateOrgSettings(formData: FormData) {
  const session = await requireCapability("organization.manage");
  const name = String(formData.get("name") ?? "").trim();
  const contactEmail = String(formData.get("contactEmail") ?? "").trim();
  if (!name) throw new Error("Organization name is required");
  await writeActiveTenantAudit(session.orgId, {
    actor: session.email,
    action: "UPDATE_ORG_SETTINGS",
    target: name,
  }, async (transaction) => {
    const changed = await transaction.updateTable("organizations")
      .set({ name, contactEmail: contactEmail || null, updatedAt: new Date() })
      .where("id", "=", session.orgId).returning("id").executeTakeFirst();
    if (!changed) throw new Error("Organization not found");
  });
  revalidatePath("/organization/settings");
}

export async function updateOrgRetention(formData: FormData) {
  const session = await requireCapability("organization.manage");
  if (session.role !== "ADMIN") throw new Error("Only an organization Admin can change retention");
  const values = Object.fromEntries(
    Object.entries(RETENTION_BOUNDS).map(([key, bounds]) => {
      const value = Number(formData.get(key));
      if (!Number.isInteger(value) || value < bounds.min || value > bounds.max) {
        throw new Error(`${key} must be between ${bounds.min} and ${bounds.max} days`);
      }
      return [key, value];
    })
  ) as EffectiveRetention;
  await writeActiveTenantAudit(session.orgId, {
    actor: session.email,
    action: "RETENTION_POLICY_UPDATED",
    target: session.orgId,
    metadata: values,
  }, async (transaction) => {
    await transaction.insertInto("retentionPolicies").values({
      orgId: session.orgId,
      ...values,
      updatedBy: session.userId,
    }).onConflict((conflict) => conflict.column("orgId").doUpdateSet({
      ...values,
      updatedBy: session.userId,
      updatedAt: new Date(),
    })).execute();
  });
  revalidatePath("/organization/settings");
}

export async function requestOrgExport() {
  const session = await requireCapability("organization.manage");
  if (session.role !== "ADMIN") throw new Error("Only an organization Admin can request an export");
  await writeActiveTenantAudit(session.orgId, {
    actor: session.email,
    action: "ORGANIZATION_EXPORT_REQUESTED",
    target: session.orgId,
  }, async (transaction) => {
    const active = await transaction.selectFrom("dataExportJobs").select("id")
      .where("orgId", "=", session.orgId).where("status", "in", ["QUEUED", "PROCESSING"])
      .executeTakeFirst();
    if (active) throw new Error("An organization export is already in progress");
    await transaction.insertInto("dataExportJobs").values({
      orgId: session.orgId,
      status: "QUEUED",
      requestedBy: session.userId,
      storageKey: null,
      storageDriver: null,
      checksum: null,
      attempts: 0,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: null,
      completedAt: null,
    }).execute();
    await enqueueJobSweep(transaction, JOB_TASKS.exports);
  });
  revalidatePath("/organization/settings");
}

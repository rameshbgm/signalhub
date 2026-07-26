"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { requireCapability } from "@/lib/admin-guard";
import { withTransaction } from "@/lib/cascade";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { RETENTION_BOUNDS } from "@/lib/retention";

export async function updateOrgSettings(formData: FormData) {
  const session = await requireCapability("organization.manage");
  const name = String(formData.get("name") ?? "").trim();
  const contactEmail = String(formData.get("contactEmail") ?? "").trim();
  if (!name) throw new Error("Organization name is required");

  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const changed = await collections.organizations().updateOne(
      { _id: oid(session.orgId) },
      { $set: { name, contactEmail: contactEmail || null } },
      { session: databaseSession }
    );
    if (!changed.matchedCount) throw new Error("Organization not found");
    await collections.auditLogs().insertOne({
      _id: new ObjectId(),
      orgId: oid(session.orgId),
      actor: session.email,
      action: "UPDATE_ORG_SETTINGS",
      target: name,
      createdAt: new Date(),
    }, { session: databaseSession });
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
  );
  const now = new Date();
  await collections.retentionPolicies().updateOne(
    { orgId: oid(session.orgId) },
    {
      $set: {
        ...values,
        updatedAt: now,
        updatedBy: oid(session.userId),
      },
      $setOnInsert: {
        _id: new ObjectId(),
        orgId: oid(session.orgId),
        createdAt: now,
      },
    },
    { upsert: true }
  );
  await collections.auditLogs().insertOne({
    _id: new ObjectId(),
    orgId: oid(session.orgId),
    actor: session.email,
    action: "RETENTION_POLICY_UPDATED",
    target: session.orgId,
    metadata: values,
    createdAt: now,
  });
  revalidatePath("/organization/settings");
}

export async function requestOrgExport() {
  const session = await requireCapability("organization.manage");
  if (session.role !== "ADMIN") throw new Error("Only an organization Admin can request an export");
  const now = new Date();
  const active = await collections.dataExportJobs().findOne({
    orgId: oid(session.orgId),
    status: { $in: ["QUEUED", "PROCESSING"] },
  });
  if (active) throw new Error("An organization export is already in progress");
  const id = new ObjectId();
  await collections.dataExportJobs().insertOne({
    _id: id,
    orgId: oid(session.orgId),
    status: "QUEUED",
    requestedBy: oid(session.userId),
    storageKey: null,
    storageDriver: null,
    checksum: null,
    attempts: 0,
    leaseOwner: null,
    leaseExpiresAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  });
  await collections.auditLogs().insertOne({
    _id: new ObjectId(),
    orgId: oid(session.orgId),
    actor: session.email,
    action: "ORGANIZATION_EXPORT_REQUESTED",
    target: id.toHexString(),
    createdAt: now,
  });
  revalidatePath("/organization/settings");
}

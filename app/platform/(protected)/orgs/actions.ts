"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { withDatabaseTransaction } from "@/lib/postgres/client";
import { organizationPurgeCanBeCancelled } from "@/lib/platform-job-policy";
import { writePlatformAudit } from "@/lib/platform-policy";
import { enqueueJobSweep, JOB_TASKS } from "@/lib/jobs";

function slugify(input: string) {
  return input.toLowerCase().normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function requiredReason(formData: FormData, minimum = 10) {
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < minimum) throw new Error(`Enter a specific reason (${minimum}+ characters)`);
  if (reason.length > 2_000) throw new Error("Reason must not exceed 2000 characters");
  return reason;
}

function revalidatePlatformOrganizationPages() {
  revalidatePath("/organization/platform");
  revalidatePath("/organization/platform/orgs");
}

export type CreateOrganizationState = {
  ok: boolean;
  error?: string;
  organizationName?: string;
};

export async function createOrganization(
  _previousState: CreateOrganizationState,
  formData: FormData
): Promise<CreateOrganizationState> {
  try {
    const actor = await requirePlatformCapability("organizations.create");
    const name = String(formData.get("name") ?? "").trim();
    const slug = slugify(String(formData.get("slug") ?? name));
    const reason = requiredReason(formData);
    if (!name || name.length > 120) throw new Error("Enter an organization name");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
      throw new Error("Use a URL-safe organization slug");
    }
    await withDatabaseTransaction(async (transaction) => {
      const organization = await transaction.insertInto("organizations").values({
        name,
        slug,
        contactEmail: actor.email || null,
        suspended: false,
        status: "ACTIVE",
        statusReason: null,
        statusChangedAt: new Date(),
        statusChangedBy: actor.platformAdminId,
      }).returning("id").executeTakeFirstOrThrow();
      await writePlatformAudit({
        actorId: actor.platformAdminId,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: "ORGANIZATION_CREATED",
        targetType: "organization",
        targetId: organization.id,
        organizationId: organization.id,
        reason,
        metadata: { slug },
      }, { executor: transaction });
    });
    revalidatePlatformOrganizationPages();
    return { ok: true, organizationName: name };
  } catch (error) {
    const duplicateSlug = error && typeof error === "object" && "code" in error && error.code === "23505";
    return {
      ok: false,
      error: duplicateSlug
        ? "That organization slug is already in use"
        : error instanceof Error ? error.message : "Organization creation failed",
    };
  }
}

export async function suspendOrg(orgId: string, formData: FormData) {
  const actor = await requirePlatformCapability("organizations.suspend");
  const reason = requiredReason(formData);
  await withDatabaseTransaction(async (transaction) => {
    const organization = await transaction.selectFrom("organizations").selectAll()
      .where("id", "=", orgId).forUpdate().executeTakeFirst();
    if (!organization) throw new Error("Organization not found");
    if (organization.status === "DELETING") {
      throw new Error("An organization queued for deletion cannot be suspended again");
    }
    const now = new Date();
    await transaction.updateTable("organizations").set({
      suspended: true,
      status: "SUSPENDED",
      statusReason: reason,
      statusChangedAt: now,
      statusChangedBy: actor.platformAdminId,
      updatedAt: now,
    }).where("id", "=", orgId).execute();
    await transaction.updateTable("notificationJobs").set({
      status: "BLOCKED",
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: "Delivery paused while the organization is suspended",
      updatedAt: now,
    }).where("pageId", "in", transaction.selectFrom("pages").select("id").where("orgId", "=", orgId))
      .where("status", "in", ["PENDING", "PROCESSING"]).execute();
    await writePlatformAudit({
      actorId: actor.platformAdminId,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "ORGANIZATION_SUSPENDED",
      targetType: "organization",
      targetId: orgId,
      organizationId: orgId,
      reason,
    }, { executor: transaction });
  });
  revalidatePlatformOrganizationPages();
}

export async function unsuspendOrg(orgId: string, formData: FormData) {
  const actor = await requirePlatformCapability("organizations.suspend");
  const reason = requiredReason(formData);
  await withDatabaseTransaction(async (transaction) => {
    const organization = await transaction.selectFrom("organizations").selectAll()
      .where("id", "=", orgId).forUpdate().executeTakeFirst();
    if (!organization) throw new Error("Organization not found");
    if (organization.status === "DELETING") throw new Error("Cancel the queued deletion before reactivation");
    if (organization.status !== "SUSPENDED") throw new Error("Only a suspended organization can be reactivated");
    const now = new Date();
    const changed = await transaction.updateTable("organizations").set({
      suspended: false,
      status: "ACTIVE",
      statusReason: reason,
      statusChangedAt: now,
      statusChangedBy: actor.platformAdminId,
      updatedAt: now,
    }).where("id", "=", orgId).where("status", "=", "SUSPENDED")
      .returning("id").executeTakeFirst();
    if (!changed) throw new Error("Organization state changed; reload and retry");
    await transaction.updateTable("notificationJobs").set({
      status: "PENDING",
      nextAttemptAt: now,
      lastError: null,
      updatedAt: now,
    }).where("pageId", "in", transaction.selectFrom("pages").select("id").where("orgId", "=", orgId))
      .where("status", "=", "BLOCKED")
      .where("lastError", "=", "Delivery paused while the organization is suspended").execute();
    await enqueueJobSweep(transaction, JOB_TASKS.notifications);
    await writePlatformAudit({
      actorId: actor.platformAdminId,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "ORGANIZATION_REACTIVATED",
      targetType: "organization",
      targetId: orgId,
      organizationId: orgId,
      reason,
    }, { executor: transaction });
  });
  revalidatePlatformOrganizationPages();
}

export async function deleteOrgAsPlatform(orgId: string, formData: FormData) {
  const actor = await requirePlatformCapability("organizations.purge");
  const reason = requiredReason(formData);
  await withDatabaseTransaction(async (transaction) => {
    const organization = await transaction.selectFrom("organizations").selectAll()
      .where("id", "=", orgId).forUpdate().executeTakeFirst();
    if (!organization) throw new Error("Organization not found");
    if (organization.status !== "SUSPENDED") throw new Error("Suspend the organization before requesting a purge");
    if (String(formData.get("confirmation") ?? "") !== organization.slug) {
      throw new Error(`Type ${organization.slug} to confirm deletion`);
    }
    const now = new Date();
    const changed = await transaction.updateTable("organizations").set({
      status: "DELETING",
      suspended: true,
      statusReason: reason,
      statusChangedAt: now,
      statusChangedBy: actor.platformAdminId,
      updatedAt: now,
    }).where("id", "=", orgId).where("status", "=", "SUSPENDED")
      .returning("id").executeTakeFirst();
    if (!changed) throw new Error("Organization state changed; reload and retry");
    const pages = await transaction.selectFrom("pages").select("id").where("orgId", "=", orgId).execute();
    const job = await transaction.insertInto("platformJobs").values({
      type: "PURGE_ORGANIZATION",
      status: "QUEUED",
      organizationId: orgId,
      organizationSlug: organization.slug,
      organizationName: organization.name,
      requestedBy: actor.platformAdminId,
      reason,
      attempts: 0,
      maxAttempts: 5,
      nextAttemptAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: null,
      startedAt: null,
      completedAt: null,
      purgeScope: {
        pageIds: pages.map((page) => page.id),
        componentIds: [], incidentIds: [], metricIds: [], monitorIds: [],
      },
    }).returning("id").executeTakeFirstOrThrow();
    await writePlatformAudit({
      actorId: actor.platformAdminId,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "ORGANIZATION_PURGE_QUEUED",
      targetType: "organization",
      targetId: orgId,
      organizationId: orgId,
      reason,
      metadata: { jobId: job.id, slug: organization.slug },
    }, { executor: transaction });
    await enqueueJobSweep(transaction, JOB_TASKS.platformJobs);
  });
  revalidatePlatformOrganizationPages();
  revalidatePath("/organization/platform/operations");
}

export async function cancelOrganizationPurge(orgId: string, formData: FormData) {
  const actor = await requirePlatformCapability("organizations.purge");
  const reason = requiredReason(formData);
  await withDatabaseTransaction(async (transaction) => {
    const organization = await transaction.selectFrom("organizations").selectAll()
      .where("id", "=", orgId).where("status", "=", "DELETING")
      .forUpdate().executeTakeFirst();
    if (!organization) throw new Error("Queued organization deletion not found");
    const job = await transaction.selectFrom("platformJobs").selectAll()
      .where("organizationId", "=", orgId).where("type", "=", "PURGE_ORGANIZATION")
      .orderBy("createdAt", "desc").forUpdate().executeTakeFirst();
    if (!job || !organizationPurgeCanBeCancelled(job)) {
      throw new Error("Purge cleanup has started and is irreversible; this organization can no longer be reactivated");
    }
    const now = new Date();
    const cancelled = await transaction.updateTable("platformJobs").set({
      status: "CANCELLED",
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: null,
      completedAt: now,
      updatedAt: now,
    }).where("id", "=", job.id).where("status", "=", "QUEUED")
      .where("attempts", "=", 0).where("startedAt", "is", null)
      .returning("id").executeTakeFirst();
    if (!cancelled) throw new Error("Purge cleanup started before cancellation completed and is now irreversible");
    const restored = await transaction.updateTable("organizations").set({
      status: "SUSPENDED",
      suspended: true,
      statusReason: reason,
      statusChangedAt: now,
      statusChangedBy: actor.platformAdminId,
      updatedAt: now,
    }).where("id", "=", orgId).where("status", "=", "DELETING")
      .returning("id").executeTakeFirst();
    if (!restored) throw new Error("Organization state changed; reload and retry");
    await writePlatformAudit({
      actorId: actor.platformAdminId,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "ORGANIZATION_PURGE_CANCELLED",
      targetType: "organization",
      targetId: orgId,
      organizationId: orgId,
      reason,
      metadata: { jobId: job.id, slug: organization.slug },
    }, { executor: transaction });
  });
  revalidatePlatformOrganizationPages();
  revalidatePath("/organization/platform/operations");
}

export async function retryPlatformJob(jobId: string, formData: FormData) {
  const actor = await requirePlatformCapability("operations.retry");
  const reason = requiredReason(formData);
  await withDatabaseTransaction(async (transaction) => {
    const now = new Date();
    const job = await transaction.updateTable("platformJobs").set({
      status: "QUEUED",
      attempts: 0,
      nextAttemptAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: null,
      updatedAt: now,
    }).where("id", "=", jobId).where("status", "=", "FAILED")
      .where((expression) => expression("attempts", ">=", expression.ref("maxAttempts")))
      .returning(["id", "organizationId"]).executeTakeFirst();
    if (!job) throw new Error("Failed job not found or its state changed");
    await writePlatformAudit({
      actorId: actor.platformAdminId,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "PLATFORM_JOB_RETRIED",
      targetType: "platformJob",
      targetId: job.id,
      organizationId: job.organizationId,
      reason,
    }, { executor: transaction });
    await enqueueJobSweep(transaction, JOB_TASKS.platformJobs);
  });
  revalidatePath("/organization/platform/operations");
}

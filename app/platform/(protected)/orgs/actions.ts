"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { withDatabaseTransaction } from "@/lib/postgres/client";
import { organizationPurgeCanBeCancelled } from "@/lib/platform-job-policy";
import { writePlatformAudit } from "@/lib/platform-policy";
import { enqueueJobSweep, JOB_TASKS } from "@/lib/jobs";

function slugify(input: string) {
  return input.toLowerCase().normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function revalidatePlatformOrganizationPages() {
  revalidatePath("/organization/platform");
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

type Actor = Awaited<ReturnType<typeof requirePlatformCapability>>;
export type OrganizationAction = "suspend" | "reactivate" | "purge" | "cancel-purge";
export type OrganizationActionResult = { done: number; failed: Array<{ id: string; message: string }> };
const MAX_BATCH = 100;

async function suspendOne(actor: Actor, orgId: string) {
  await withDatabaseTransaction(async (transaction) => {
    const organization = await transaction.selectFrom("organizations").selectAll()
      .where("id", "=", orgId).forUpdate().executeTakeFirst();
    if (!organization) throw new Error("Organization not found");
    if (organization.status === "DELETING") {
      throw new Error("An organization queued for deletion cannot be suspended again");
    }
    if (organization.status === "SUSPENDED") throw new Error("Already suspended");
    const now = new Date();
    await transaction.updateTable("organizations").set({
      suspended: true,
      status: "SUSPENDED",
      statusReason: null,
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
    }, { executor: transaction });
  });
}

async function reactivateOne(actor: Actor, orgId: string) {
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
      statusReason: null,
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
    }, { executor: transaction });
  });
}

async function purgeOne(actor: Actor, orgId: string, confirmation: string) {
  await withDatabaseTransaction(async (transaction) => {
    const organization = await transaction.selectFrom("organizations").selectAll()
      .where("id", "=", orgId).forUpdate().executeTakeFirst();
    if (!organization) throw new Error("Organization not found");
    if (organization.status !== "SUSPENDED") throw new Error("Suspend the organization before requesting a purge");
    if (confirmation !== organization.slug) throw new Error(`Type ${organization.slug} to confirm deletion`);
    const now = new Date();
    const changed = await transaction.updateTable("organizations").set({
      status: "DELETING",
      suspended: true,
      statusReason: null,
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
      reason: "Queued from Platform administration",
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
      metadata: { jobId: job.id, slug: organization.slug },
    }, { executor: transaction });
    await enqueueJobSweep(transaction, JOB_TASKS.platformJobs);
  });
}

async function cancelPurgeOne(actor: Actor, orgId: string) {
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
      statusReason: null,
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
      metadata: { jobId: job.id, slug: organization.slug },
    }, { executor: transaction });
  });
}

const CAPABILITY = { suspend: "organizations.suspend", reactivate: "organizations.suspend", purge: "organizations.purge", "cancel-purge": "organizations.purge" } as const;

/**
 * One entry point for the row buttons and the bulk bar. Each organization is its
 * own transaction, so one that cannot change state is reported and the rest still
 * go through. A purge is never batched and must carry the organization's slug.
 */
export async function runOrganizationAction(action: OrganizationAction, ids: string[], confirmation = ""): Promise<OrganizationActionResult> {
  // The action comes from the client: accept only our own keys, and gate each by its own capability.
  if (!Object.hasOwn(CAPABILITY, action)) throw new Error("Unknown action");
  const actor = await requirePlatformCapability(CAPABILITY[action]);
  const unique = [...new Set(ids)];
  if (unique.length === 0) throw new Error("Select at least one organization");
  if (unique.length > MAX_BATCH) throw new Error(`Select at most ${MAX_BATCH} organizations at a time`);
  if (action === "purge" && unique.length !== 1) throw new Error("Purge one organization at a time");

  const result: OrganizationActionResult = { done: 0, failed: [] };
  for (const id of unique) {
    try {
      if (action === "suspend") await suspendOne(actor, id);
      else if (action === "reactivate") await reactivateOne(actor, id);
      else if (action === "purge") await purgeOne(actor, id, confirmation);
      else await cancelPurgeOne(actor, id);
      result.done += 1;
    } catch (error) {
      unstable_rethrow(error);
      result.failed.push({ id, message: error instanceof Error && error.message.length <= 200 ? error.message : "Could not be changed" });
    }
  }
  revalidatePlatformOrganizationPages();
  revalidatePath("/organization/platform/operations");
  return result;
}

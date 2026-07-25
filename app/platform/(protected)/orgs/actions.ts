"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { collections, mongoClient } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import {
  requirePlatformCapability,
} from "@/lib/admin-guard";
import { createSession } from "@/lib/auth";
import { generateSecret } from "@/lib/secrets";
import { publicAppUrl } from "@/lib/url";
import { canonicalizeEmail, CAPABILITIES, type Capability } from "@/lib/identity";
import { organizationStatus } from "@/lib/organization-state";
import { organizationPurgeCanBeCancelled } from "@/lib/platform-job-policy";
import { requirePlatformStepUp } from "@/lib/platform-admin-safety";
import { writePlatformAudit } from "@/lib/platform-policy";

const SUPPORT_SCOPES = new Set<Capability>([
  "incident.manage",
  "incident.update",
  "monitor.manage",
]);

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function requiredReason(formData: FormData, minimum = 10) {
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < minimum) throw new Error(`Enter a specific reason (${minimum}+ characters)`);
  if (reason.length > 2_000) throw new Error("Reason must not exceed 2000 characters");
  return reason;
}

export type CreateOrganizationState = {
  ok: boolean;
  error?: string;
  inviteUrl?: string;
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
    const ownerName = String(formData.get("ownerName") ?? "").trim();
    const ownerEmail = canonicalizeEmail(String(formData.get("ownerEmail") ?? ""));
    const reason = requiredReason(formData);
    const baseUrl = publicAppUrl();
    if (!name || name.length > 120) throw new Error("Enter an organization name");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
      throw new Error("Use a URL-safe organization slug");
    }
    if (!ownerName || ownerName.length > 120) throw new Error("Enter the owner name");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
      throw new Error("Enter a valid owner email");
    }
    const invitation = generateSecret("org_invite_");
    const organizationId = new ObjectId();
    const membershipId = new ObjectId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 48 * 60 * 60_000);
    const databaseSession = mongoClient.startSession();
    try {
      await databaseSession.withTransaction(async () => {
        if (await collections.organizations().findOne({ slug }, { session: databaseSession })) {
          throw new Error("That organization slug is already in use");
        }
        let user = await collections.users().findOne(
          { canonicalEmail: ownerEmail },
          { session: databaseSession }
        );
        if (user?.disabled) throw new Error("The requested owner identity is disabled");
        if (user && !user.passwordHash) {
          throw new Error(
            "The requested owner already has a passwordless identity. Ask them to sign in through their identity provider; an owner invitation cannot set a password on an existing identity."
          );
        }
        if (!user) {
          const userId = new ObjectId();
          await collections.users().insertOne(
            {
              _id: userId,
              email: ownerEmail,
              canonicalEmail: ownerEmail,
              passwordHash: null,
              name: ownerName,
              twoFactorEnabled: false,
              oidcIssuer: null,
              oidcSubject: null,
              disabled: false,
              mustChangePassword: false,
              createdAt: now,
              updatedAt: now,
            },
            { session: databaseSession }
          );
          user = await collections.users().findOne(
            { _id: userId },
            { session: databaseSession }
          );
        }
        if (!user) throw new Error("Owner identity could not be created");
        await collections.organizations().insertOne(
          {
            _id: organizationId,
            name,
            slug,
            contactEmail: ownerEmail,
            suspended: false,
            status: "PROVISIONING",
            statusReason: reason,
            statusChangedAt: now,
            statusChangedBy: oid(actor.platformAdminId),
            createdAt: now,
            updatedAt: now,
          },
          { session: databaseSession }
        );
        await collections.memberships().insertOne(
          {
            _id: membershipId,
            orgId: organizationId,
            userId: user._id,
            role: "OWNER",
            status: "INVITED",
            pageIds: null,
            invitationExpiresAt: expiresAt,
            invitationTokenHash: invitation.hash,
            activatedAt: null,
            createdAt: now,
          },
          { session: databaseSession }
        );
        await collections.organizations().updateOne(
          { _id: organizationId, status: "PROVISIONING" },
          {
            $set: {
              status: "ACTIVE",
              statusReason: null,
              statusChangedAt: now,
              updatedAt: now,
            },
          },
          { session: databaseSession }
        );
        await collections.platformAuditLogs().insertOne(
          {
            _id: new ObjectId(),
            actorId: oid(actor.platformAdminId),
            actorEmail: actor.email,
            actorRole: actor.role,
            action: "ORGANIZATION_CREATED",
            targetType: "organization",
            targetId: organizationId.toHexString(),
            organizationId,
            reason,
            metadata: { slug, ownerEmail, invitationExpiresAt: expiresAt },
            createdAt: now,
          },
          { session: databaseSession }
        );
      });
    } finally {
      await databaseSession.endSession();
    }
    revalidatePath("/platform");
    revalidatePath("/platform/orgs");
    return {
      ok: true,
      organizationName: name,
      inviteUrl: `${baseUrl}/invite/${invitation.token}`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Organization creation failed",
    };
  }
}

export async function startSupportSession(orgId: string, formData: FormData) {
  const mode = String(formData.get("mode") ?? "VIEW") === "OPERATE" ? "OPERATE" : "VIEW";
  const platformSession =
    mode === "OPERATE"
      ? await requirePlatformCapability("support.operate")
      : await requirePlatformCapability("support.view");
  const reason = requiredReason(formData);
  const requestedScopes = formData
    .getAll("scopes")
    .map(String)
    .filter((scope): scope is Capability => CAPABILITIES.includes(scope as Capability));
  const scopes =
    mode === "OPERATE"
      ? [...new Set(requestedScopes.filter((scope) => SUPPORT_SCOPES.has(scope)))]
      : [];
  if (mode === "OPERATE" && scopes.length === 0) {
    redirect("/platform/orgs?error=support-scope");
  }
  const orgDoc = await collections.organizations().findOne({ _id: oid(orgId) });
  if (!orgDoc) redirect("/platform/orgs?error=organization-not-found");
  if (organizationStatus(orgDoc) !== "ACTIVE") {
    redirect("/platform/orgs?error=organization-suspended");
  }

  const supportId = new ObjectId();
  const credential = generateSecret("support_");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60_000);
  const databaseSession = mongoClient.startSession();
  try {
    await databaseSession.withTransaction(async () => {
      await collections.supportSessions().insertOne(
        {
          _id: supportId,
          platformAdminId: oid(platformSession.platformAdminId),
          orgId: orgDoc._id,
          reason,
          mode,
          scopes,
          tokenHash: credential.hash,
          expiresAt,
          revokedAt: null,
          revokedBy: null,
          revokedReason: null,
          endedAt: null,
          createdAt: now,
        },
        { session: databaseSession }
      );
      await collections.auditLogs().insertOne(
        {
          _id: new ObjectId(),
          orgId: orgDoc._id,
          actor: platformSession.email,
          action: "SUPPORT_SESSION_STARTED",
          target: orgDoc.slug,
          metadata: { reason, mode, scopes, expiresAt },
          supportSessionId: supportId,
          createdAt: now,
        },
        { session: databaseSession }
      );
      await collections.platformAuditLogs().insertOne(
        {
          _id: new ObjectId(),
          actorId: oid(platformSession.platformAdminId),
          actorEmail: platformSession.email,
          actorRole: platformSession.role,
          action: "SUPPORT_SESSION_STARTED",
          targetType: "supportSession",
          targetId: supportId.toHexString(),
          organizationId: orgDoc._id,
          reason,
          metadata: { mode, scopes, expiresAt },
          createdAt: now,
        },
        { session: databaseSession }
      );
    });
  } finally {
    await databaseSession.endSession();
  }

  await createSession(
    {
      // Support authorization is derived from the durable support-session
      // record, never from a borrowed customer identity.
      userId: platformSession.platformAdminId,
      membershipId: supportId.toHexString(),
      orgId: orgDoc._id.toHexString(),
      email: platformSession.email,
      name: platformSession.name,
      role: mode === "OPERATE" ? "ADMIN" : "VIEWER",
      supportSessionId: supportId.toHexString(),
      supportSessionToken: credential.token,
      supportActorEmail: platformSession.email,
      supportActorName: platformSession.name,
      supportMode: mode,
    },
    { maxAgeSeconds: 30 * 60 }
  );
  redirect("/admin");
}

export async function suspendOrg(orgId: string, formData: FormData) {
  const actor = await requirePlatformCapability("organizations.suspend");
  const reason = requiredReason(formData);
  const id = oid(orgId);
  const now = new Date();
  const databaseSession = mongoClient.startSession();
  try {
    await databaseSession.withTransaction(async () => {
      const organization = await collections.organizations().findOne(
        { _id: id },
        { session: databaseSession }
      );
      if (!organization) throw new Error("Organization not found");
      if (organizationStatus(organization) === "DELETING") {
        throw new Error("An organization queued for deletion cannot be suspended again");
      }
      await collections.organizations().updateOne(
        { _id: id },
        {
          $set: {
            suspended: true,
            status: "SUSPENDED",
            statusReason: reason,
            statusChangedAt: now,
            statusChangedBy: oid(actor.platformAdminId),
            updatedAt: now,
          },
        },
        { session: databaseSession }
      );
      await collections.supportSessions().updateMany(
        { orgId: id, revokedAt: null },
        {
          $set: {
            revokedAt: now,
            endedAt: now,
            revokedBy: oid(actor.platformAdminId),
            revokedReason: "organization suspended",
          },
        },
        { session: databaseSession }
      );
      const pageIds = (
        await collections.pages().find({ orgId: id }, { session: databaseSession }).toArray()
      ).map((page) => page._id);
      await collections.notificationJobs().updateMany(
        { pageId: { $in: pageIds }, status: { $in: ["PENDING", "PROCESSING"] } },
        {
          $set: {
            status: "BLOCKED",
            leaseOwner: null,
            leaseExpiresAt: null,
            lastError: "Delivery paused while the organization is suspended",
            updatedAt: now,
          },
        },
        { session: databaseSession }
      );
      await collections.platformAuditLogs().insertOne(
        {
          _id: new ObjectId(),
          actorId: oid(actor.platformAdminId),
          actorEmail: actor.email,
          actorRole: actor.role,
          action: "ORGANIZATION_SUSPENDED",
          targetType: "organization",
          targetId: id.toHexString(),
          organizationId: id,
          reason,
          metadata: null,
          createdAt: now,
        },
        { session: databaseSession }
      );
    });
  } finally {
    await databaseSession.endSession();
  }
  revalidatePath("/platform");
  revalidatePath("/platform/orgs");
}

export async function unsuspendOrg(orgId: string, formData: FormData) {
  const actor = await requirePlatformCapability("organizations.suspend");
  const reason = requiredReason(formData);
  const id = oid(orgId);
  const now = new Date();
  const databaseSession = mongoClient.startSession();
  try {
    await databaseSession.withTransaction(async () => {
      const organization = await collections.organizations().findOne(
        { _id: id },
        { session: databaseSession }
      );
      if (!organization) throw new Error("Organization not found");
      if (organizationStatus(organization) === "DELETING") {
        throw new Error("Cancel the queued deletion before reactivation");
      }
      if (organizationStatus(organization) !== "SUSPENDED") {
        throw new Error("Only a suspended organization can be reactivated");
      }
      const pageIds = (
        await collections
          .pages()
          .find({ orgId: id }, { session: databaseSession, projection: { _id: 1 } })
          .toArray()
      ).map((page) => page._id);
      const changed = await collections.organizations().updateOne(
        { _id: id, status: "SUSPENDED" },
        {
          $set: {
            suspended: false,
            status: "ACTIVE",
            statusReason: reason,
            statusChangedAt: now,
            statusChangedBy: oid(actor.platformAdminId),
            updatedAt: now,
          },
        },
        { session: databaseSession }
      );
      if (!changed.modifiedCount) {
        throw new Error("Organization state changed; reload and retry");
      }
      await collections.notificationJobs().updateMany(
        {
          pageId: { $in: pageIds },
          status: "BLOCKED",
          lastError: "Delivery paused while the organization is suspended",
        },
        {
          $set: {
            status: "PENDING",
            nextAttemptAt: now,
            lastError: null,
            updatedAt: now,
          },
        },
        { session: databaseSession }
      );
      await collections.platformAuditLogs().insertOne(
        {
          _id: new ObjectId(),
          actorId: oid(actor.platformAdminId),
          actorEmail: actor.email,
          actorRole: actor.role,
          action: "ORGANIZATION_REACTIVATED",
          targetType: "organization",
          targetId: id.toHexString(),
          organizationId: id,
          reason,
          metadata: null,
          createdAt: now,
        },
        { session: databaseSession }
      );
    });
  } finally {
    await databaseSession.endSession();
  }
  revalidatePath("/platform");
  revalidatePath("/platform/orgs");
}

export async function deleteOrgAsPlatform(orgId: string, formData: FormData) {
  const actor = await requirePlatformCapability("organizations.purge");
  await requirePlatformStepUp(
    actor.platformAdminId,
    formData,
    "organization purge"
  );
  const organization = await collections.organizations().findOne({ _id: oid(orgId) });
  if (!organization) throw new Error("Organization not found");
  if (organizationStatus(organization) !== "SUSPENDED") {
    throw new Error("Suspend the organization before requesting a purge");
  }
  if (String(formData.get("confirmation") ?? "") !== organization.slug) {
    throw new Error(`Type ${organization.slug} to confirm deletion`);
  }
  const reason = requiredReason(formData);
  const now = new Date();
  const jobId = new ObjectId();
  const databaseSession = mongoClient.startSession();
  try {
    await databaseSession.withTransaction(async () => {
      const changed = await collections.organizations().updateOne(
        { _id: organization._id, status: "SUSPENDED" },
        {
          $set: {
            status: "DELETING",
            suspended: true,
            statusReason: reason,
            statusChangedAt: now,
            statusChangedBy: oid(actor.platformAdminId),
            updatedAt: now,
          },
        },
        { session: databaseSession }
      );
      if (!changed.modifiedCount) throw new Error("Organization state changed; reload and retry");
      const purgePageIds = (
        await collections
          .pages()
          .find(
            { orgId: organization._id },
            { session: databaseSession, projection: { _id: 1 } }
          )
          .toArray()
      ).map((page) => page._id);
      await collections.platformJobs().insertOne(
        {
          _id: jobId,
          type: "PURGE_ORGANIZATION",
          status: "QUEUED",
          organizationId: organization._id,
          organizationSlug: organization.slug,
          organizationName: organization.name,
          requestedBy: oid(actor.platformAdminId),
          reason,
          attempts: 0,
          maxAttempts: 5,
          nextAttemptAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: null,
          createdAt: now,
          updatedAt: now,
          startedAt: null,
          completedAt: null,
          purgeScope: {
            pageIds: purgePageIds,
            componentIds: [],
            incidentIds: [],
            metricIds: [],
            monitorIds: [],
          },
        },
        { session: databaseSession }
      );
      await collections.platformAuditLogs().insertOne(
        {
          _id: new ObjectId(),
          actorId: oid(actor.platformAdminId),
          actorEmail: actor.email,
          actorRole: actor.role,
          action: "ORGANIZATION_PURGE_QUEUED",
          targetType: "organization",
          targetId: organization._id.toHexString(),
          organizationId: organization._id,
          reason,
          metadata: { jobId: jobId.toHexString(), slug: organization.slug },
          createdAt: now,
        },
        { session: databaseSession }
      );
    });
  } finally {
    await databaseSession.endSession();
  }
  revalidatePath("/platform");
  revalidatePath("/platform/orgs");
  revalidatePath("/platform/operations");
}

export async function cancelOrganizationPurge(orgId: string, formData: FormData) {
  const actor = await requirePlatformCapability("organizations.purge");
  const reason = requiredReason(formData);
  const id = oid(orgId);
  const now = new Date();
  const databaseSession = mongoClient.startSession();
  try {
    await databaseSession.withTransaction(async () => {
      const organization = await collections.organizations().findOne(
        { _id: id, status: "DELETING" },
        { session: databaseSession }
      );
      if (!organization) throw new Error("Queued organization deletion not found");
      const job = await collections
        .platformJobs()
        .find(
          {
            organizationId: id,
            type: "PURGE_ORGANIZATION",
          },
          { session: databaseSession }
        )
        .sort({ createdAt: -1 })
        .limit(1)
        .next();
      if (!job || !organizationPurgeCanBeCancelled(job)) {
        throw new Error(
          "Purge cleanup has started and is irreversible; this organization can no longer be reactivated"
        );
      }
      const cancelled = await collections.platformJobs().updateOne(
        {
          _id: job._id,
          status: "QUEUED",
          attempts: 0,
          startedAt: null,
        },
        {
          $set: {
            status: "CANCELLED",
            leaseOwner: null,
            leaseExpiresAt: null,
            lastError: null,
            completedAt: now,
            updatedAt: now,
          },
        },
        { session: databaseSession }
      );
      if (!cancelled.modifiedCount) {
        throw new Error(
          "Purge cleanup started before cancellation completed and is now irreversible"
        );
      }
      const restored = await collections.organizations().updateOne(
        { _id: id, status: "DELETING" },
        {
          $set: {
            status: "SUSPENDED",
            suspended: true,
            statusReason: reason,
            statusChangedAt: now,
            statusChangedBy: oid(actor.platformAdminId),
            updatedAt: now,
          },
        },
        { session: databaseSession }
      );
      if (!restored.modifiedCount) {
        throw new Error("Organization state changed; reload and retry");
      }
      await collections.platformAuditLogs().insertOne(
        {
          _id: new ObjectId(),
          actorId: oid(actor.platformAdminId),
          actorEmail: actor.email,
          actorRole: actor.role,
          action: "ORGANIZATION_PURGE_CANCELLED",
          targetType: "organization",
          targetId: id.toHexString(),
          organizationId: id,
          reason,
          metadata: { jobId: job._id.toHexString(), slug: organization.slug },
          createdAt: now,
        },
        { session: databaseSession }
      );
    });
  } finally {
    await databaseSession.endSession();
  }
  revalidatePath("/platform");
  revalidatePath("/platform/orgs");
  revalidatePath("/platform/operations");
}

export async function retryPlatformJob(jobId: string, formData: FormData) {
  const actor = await requirePlatformCapability("operations.retry");
  const reason = requiredReason(formData);
  const databaseSession = mongoClient.startSession();
  try {
    await databaseSession.withTransaction(async () => {
      const job = await collections.platformJobs().findOne(
        {
          _id: oid(jobId),
          status: "FAILED",
          $expr: { $gte: ["$attempts", "$maxAttempts"] },
        },
        { session: databaseSession }
      );
      if (!job) throw new Error("Failed job not found");
      const now = new Date();
      const changed = await collections.platformJobs().updateOne(
        {
          _id: job._id,
          status: "FAILED",
          $expr: { $gte: ["$attempts", "$maxAttempts"] },
        },
        {
          $set: {
            status: "QUEUED",
            attempts: 0,
            nextAttemptAt: now,
            leaseOwner: null,
            leaseExpiresAt: null,
            lastError: null,
            updatedAt: now,
          },
        },
        { session: databaseSession }
      );
      if (!changed.modifiedCount) {
        throw new Error("Job state changed; reload and retry");
      }
      await writePlatformAudit(
        {
          actorId: oid(actor.platformAdminId),
          actorEmail: actor.email,
          actorRole: actor.role,
          action: "PLATFORM_JOB_RETRIED",
          targetType: "platformJob",
          targetId: job._id.toHexString(),
          organizationId: job.organizationId,
          reason,
        },
        { session: databaseSession }
      );
    });
  } finally {
    await databaseSession.endSession();
  }
  revalidatePath("/platform/operations");
}

export async function revokeSupportSession(sessionId: string, formData: FormData) {
  const actor = await requirePlatformCapability("support.operate");
  const reason = requiredReason(formData);
  const now = new Date();
  const databaseSession = mongoClient.startSession();
  try {
    await databaseSession.withTransaction(async () => {
      const support = await collections.supportSessions().findOne(
        { _id: oid(sessionId) },
        { session: databaseSession }
      );
      if (!support) throw new Error("Support session not found");
      const changed = await collections.supportSessions().updateOne(
        { _id: support._id, revokedAt: null, expiresAt: { $gt: now } },
        {
          $set: {
            revokedAt: now,
            endedAt: now,
            revokedBy: oid(actor.platformAdminId),
            revokedReason: reason,
          },
        },
        { session: databaseSession }
      );
      if (!changed.modifiedCount) {
        throw new Error("Support session already ended; reload and retry");
      }
      await collections.auditLogs().insertOne(
        {
          _id: new ObjectId(),
          orgId: support.orgId,
          actor: actor.email,
          action: "SUPPORT_SESSION_REVOKED",
          target: support._id.toHexString(),
          metadata: { reason },
          supportSessionId: support._id,
          createdAt: now,
        },
        { session: databaseSession }
      );
      await writePlatformAudit(
        {
          actorId: oid(actor.platformAdminId),
          actorEmail: actor.email,
          actorRole: actor.role,
          action: "SUPPORT_SESSION_REVOKED",
          targetType: "supportSession",
          targetId: support._id.toHexString(),
          organizationId: support.orgId,
          reason,
        },
        { session: databaseSession }
      );
    });
  } finally {
    await databaseSession.endSession();
  }
  revalidatePath("/platform/support");
}

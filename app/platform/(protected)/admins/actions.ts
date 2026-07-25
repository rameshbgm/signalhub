"use server";

import { ObjectId, type ClientSession } from "mongodb";
import { revalidatePath } from "next/cache";
import { collections } from "@/lib/db";
import type {
  PlatformAdminDoc,
  PlatformAdminStatus,
  PlatformRole,
} from "@/lib/db";
import { canonicalizeEmail } from "@/lib/identity";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { generateSecret } from "@/lib/secrets";
import { oid } from "@/lib/mongo-utils";
import {
  hasPlatformCapability,
  normalizedPlatformRole,
  platformAdminIsActive,
  writePlatformAudit,
} from "@/lib/platform-policy";
import { publicAppUrl } from "@/lib/url";
import {
  platformSessionVersionTransition,
  requirePlatformStepUp,
  transitionRemovesActivePlatformOwner,
  withPlatformAdminInvariantTransaction,
} from "@/lib/platform-admin-safety";

export type PlatformInviteState = {
  ok: boolean;
  error?: string;
  inviteUrl?: string;
};

function validRole(value: string): value is PlatformRole {
  return ["OWNER", "OPERATOR", "AUDITOR"].includes(value);
}

function validStatus(value: string): value is PlatformAdminStatus {
  return value === "ACTIVE" || value === "DISABLED";
}

function reason(formData: FormData) {
  const value = String(formData.get("reason") ?? "").trim();
  if (value.length < 10) throw new Error("Enter a specific reason containing at least 10 characters");
  if (value.length > 2_000) throw new Error("Reason must not exceed 2000 characters");
  return value;
}

type PlatformActor = {
  platformAdminId: string;
  email: string;
  role: PlatformRole;
  sessionVersion: number;
};

type CurrentPlatformManager = PlatformActor & {
  admin: PlatformAdminDoc;
};

async function requireCurrentPlatformManager(
  requestedActor: PlatformActor,
  session: ClientSession
): Promise<CurrentPlatformManager> {
  const admin = await collections.platformAdmins().findOne(
    {
      _id: oid(requestedActor.platformAdminId),
      status: { $ne: "DISABLED" },
    },
    { session }
  );
  if (
    !admin ||
    !platformAdminIsActive(admin) ||
    !admin.totpSecretCiphertext ||
    (admin.sessionVersion ?? 1) !== requestedActor.sessionVersion
  ) {
    throw new Error(
      "Platform administrator authorization changed; sign in again"
    );
  }
  const role = normalizedPlatformRole(admin);
  if (!hasPlatformCapability(role, "admins.manage")) {
    throw new Error(
      "Platform administrator authorization changed; reload and retry"
    );
  }
  return {
    platformAdminId: admin._id.toHexString(),
    email: admin.email,
    role,
    sessionVersion: admin.sessionVersion ?? 1,
    admin,
  };
}

async function revokeActiveSupportSessions(
  platformAdminId: ObjectId,
  actorId: ObjectId,
  revokedReason: string,
  now: Date,
  session: ClientSession
) {
  await collections.supportSessions().updateMany(
    {
      platformAdminId,
      revokedAt: null,
      expiresAt: { $gt: now },
    },
    {
      $set: {
        revokedAt: now,
        endedAt: now,
        revokedBy: actorId,
        revokedReason,
      },
    },
    { session }
  );
}

async function insertAdminAudit(
  actor: PlatformActor,
  target: { id: ObjectId; email: string },
  input: {
    action: string;
    reason: string;
    metadata?: Record<string, unknown>;
  },
  now: Date,
  session: ClientSession
) {
  await collections.platformAuditLogs().insertOne(
    {
      _id: new ObjectId(),
      actorId: oid(actor.platformAdminId),
      actorEmail: actor.email,
      actorRole: actor.role,
      action: input.action,
      targetType: "platformAdmin",
      targetId: target.id.toHexString(),
      organizationId: null,
      reason: input.reason,
      metadata: { email: target.email, ...(input.metadata ?? {}) },
      createdAt: now,
    },
    { session }
  );
}

export async function createPlatformInvite(
  _previous: PlatformInviteState,
  formData: FormData
): Promise<PlatformInviteState> {
  try {
    const actor = await requirePlatformCapability("admins.manage");
    const email = canonicalizeEmail(String(formData.get("email") ?? ""));
    const name = String(formData.get("name") ?? "").trim();
    const role = String(formData.get("role") ?? "");
    const changeReason = reason(formData);
    const baseUrl = publicAppUrl();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email");
    if (!name || name.length > 120) throw new Error("Enter the administrator name");
    if (!validRole(role)) throw new Error("Choose a valid platform role");
    const invitation = generateSecret("platform_invite_");
    const invitationId = new ObjectId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 48 * 60 * 60_000);
    await withPlatformAdminInvariantTransaction(async (session) => {
      const currentActor = await requireCurrentPlatformManager(actor, session);
      if (
        await collections
          .platformAdmins()
          .findOne({ canonicalEmail: email }, { session })
      ) {
        throw new Error("That email already has a platform account");
      }
      await collections.platformInvites().updateMany(
        { canonicalEmail: email, acceptedAt: null, revokedAt: null },
        { $set: { revokedAt: now } },
        { session }
      );
      await collections.platformInvites().insertOne(
        {
          _id: invitationId,
          email,
          canonicalEmail: email,
          name,
          role,
          tokenHash: invitation.hash,
          createdBy: currentActor.admin._id,
          expiresAt,
          acceptedAt: null,
          revokedAt: null,
          createdAt: now,
        },
        { session }
      );
      await writePlatformAudit(
        {
          actorId: currentActor.admin._id,
          actorEmail: currentActor.email,
          actorRole: currentActor.role,
          action: "PLATFORM_ADMIN_INVITED",
          targetType: "platformInvite",
          targetId: invitationId.toHexString(),
          reason: changeReason,
          metadata: { email, role, expiresAt },
        },
        { session }
      );
    });
    revalidatePath("/platform/admins");
    return { ok: true, inviteUrl: `${baseUrl}/platform/invite/${invitation.token}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invitation failed" };
  }
}

export async function revokePlatformInvite(inviteId: string, formData: FormData) {
  const actor = await requirePlatformCapability("admins.manage");
  const changeReason = reason(formData);
  await withPlatformAdminInvariantTransaction(async (session) => {
    const currentActor = await requireCurrentPlatformManager(actor, session);
    const invitation = await collections.platformInvites().findOne(
      { _id: oid(inviteId) },
      { session }
    );
    if (!invitation) throw new Error("Platform invitation not found");
    const changed = await collections.platformInvites().updateOne(
      { _id: invitation._id, acceptedAt: null, revokedAt: null },
      { $set: { revokedAt: new Date() } },
      { session }
    );
    if (!changed.modifiedCount) {
      throw new Error("Invitation state changed; reload and retry");
    }
    await writePlatformAudit(
      {
        actorId: currentActor.admin._id,
        actorEmail: currentActor.email,
        actorRole: currentActor.role,
        action: "PLATFORM_ADMIN_INVITE_REVOKED",
        targetType: "platformInvite",
        targetId: invitation._id.toHexString(),
        reason: changeReason,
        metadata: { email: invitation.email },
      },
      { session }
    );
  });
  revalidatePath("/platform/admins");
}

export async function updatePlatformAdminRole(adminId: string, formData: FormData) {
  const actor = await requirePlatformCapability("admins.manage");
  const role = String(formData.get("role") ?? "");
  const changeReason = reason(formData);
  if (!validRole(role)) throw new Error("Choose a valid role");
  const id = oid(adminId);
  await withPlatformAdminInvariantTransaction(async (session) => {
    const currentActor = await requireCurrentPlatformManager(actor, session);
    const admin =
      currentActor.admin._id.equals(id)
        ? currentActor.admin
        : await collections.platformAdmins().findOne({ _id: id }, { session });
    if (!admin) throw new Error("Platform administrator not found");
    const currentRole = admin.role ?? "OWNER";
    const currentStatus = admin.status ?? "ACTIVE";
    if (currentRole === role) {
      throw new Error("Choose a different platform administrator role");
    }

    if (
      transitionRemovesActivePlatformOwner(
        { role: currentRole, status: currentStatus },
        { role, status: currentStatus }
      )
    ) {
      const activeOwners = await collections.platformAdmins().countDocuments(
        {
          status: { $ne: "DISABLED" },
          $expr: {
            $eq: [{ $ifNull: ["$role", "OWNER"] }, "OWNER"],
          },
        },
        { session }
      );
      if (activeOwners <= 1) {
        throw new Error("The last active platform Owner cannot be demoted");
      }
    }

    const now = new Date();
    const sessionVersion = platformSessionVersionTransition(admin);
    const changed = await collections.platformAdmins().updateOne(
      { _id: admin._id, ...sessionVersion.filter },
      {
        $set: {
          role,
          sessionVersion: sessionVersion.next,
          updatedAt: now,
        },
      },
      { session }
    );
    if (!changed.matchedCount) {
      throw new Error("Platform administrator state changed; reload and retry");
    }
    await revokeActiveSupportSessions(
      admin._id,
      currentActor.admin._id,
      "platform administrator role changed",
      now,
      session
    );
    await insertAdminAudit(
      currentActor,
      { id: admin._id, email: admin.email },
      {
        action: "PLATFORM_ADMIN_ROLE_CHANGED",
        reason: changeReason,
        metadata: { from: currentRole, to: role },
      },
      now,
      session
    );
  });
  revalidatePath("/platform/admins");
}

export async function setPlatformAdminStatus(
  adminId: string,
  desiredStatus: string,
  formData: FormData
) {
  const actor = await requirePlatformCapability("admins.manage");
  const changeReason = reason(formData);
  if (!validStatus(desiredStatus)) {
    throw new Error("Choose a valid platform administrator status");
  }
  const id = oid(adminId);
  await withPlatformAdminInvariantTransaction(async (session) => {
    const currentActor = await requireCurrentPlatformManager(actor, session);
    const admin =
      currentActor.admin._id.equals(id)
        ? currentActor.admin
        : await collections.platformAdmins().findOne({ _id: id }, { session });
    if (!admin) throw new Error("Platform administrator not found");
    const currentRole = admin.role ?? "OWNER";
    const currentStatus = admin.status ?? "ACTIVE";
    if (currentStatus === desiredStatus) {
      throw new Error(
        `Platform administrator is already ${desiredStatus.toLowerCase()}; reload and retry`
      );
    }

    if (
      transitionRemovesActivePlatformOwner(
        { role: currentRole, status: currentStatus },
        { role: currentRole, status: desiredStatus }
      )
    ) {
      const activeOwners = await collections.platformAdmins().countDocuments(
        {
          status: { $ne: "DISABLED" },
          $expr: {
            $eq: [{ $ifNull: ["$role", "OWNER"] }, "OWNER"],
          },
        },
        { session }
      );
      if (activeOwners <= 1) {
        throw new Error("The last active platform Owner cannot be disabled");
      }
    }

    const now = new Date();
    const currentStateFilter =
      currentStatus === "DISABLED"
        ? { status: "DISABLED" as const }
        : {
            $or: [
              { status: "ACTIVE" as const },
              { status: { $exists: false } },
            ],
          };
    const sessionVersion = platformSessionVersionTransition(admin);
    const changed = await collections.platformAdmins().updateOne(
      {
        _id: admin._id,
        ...currentStateFilter,
        ...sessionVersion.filter,
      },
      {
        $set: {
          status: desiredStatus,
          disabledAt: desiredStatus === "DISABLED" ? now : null,
          disabledBy:
            desiredStatus === "DISABLED" ? currentActor.admin._id : null,
          sessionVersion: sessionVersion.next,
          updatedAt: now,
        },
      },
      { session }
    );
    if (!changed.matchedCount) {
      throw new Error("Platform administrator state changed; reload and retry");
    }
    await revokeActiveSupportSessions(
      admin._id,
      currentActor.admin._id,
      "platform administrator state changed",
      now,
      session
    );
    await insertAdminAudit(
      currentActor,
      { id: admin._id, email: admin.email },
      {
        action:
          desiredStatus === "DISABLED"
            ? "PLATFORM_ADMIN_DISABLED"
            : "PLATFORM_ADMIN_REACTIVATED",
        reason: changeReason,
        metadata: { from: currentStatus, to: desiredStatus },
      },
      now,
      session
    );
  });
  revalidatePath("/platform/admins");
}

export async function resetPlatformAdminMfa(adminId: string, formData: FormData) {
  const actor = await requirePlatformCapability("admins.manage");
  const changeReason = reason(formData);
  await requirePlatformStepUp(
    actor.platformAdminId,
    formData,
    "platform administrator MFA reset"
  );
  const id = oid(adminId);
  await withPlatformAdminInvariantTransaction(async (session) => {
    const currentActor = await requireCurrentPlatformManager(actor, session);
    const admin =
      currentActor.admin._id.equals(id)
        ? currentActor.admin
        : await collections.platformAdmins().findOne(
            {
              _id: id,
              status: { $ne: "DISABLED" },
            },
            { session }
          );
    if (!admin || (admin.status ?? "ACTIVE") !== "ACTIVE") {
      throw new Error("Active platform administrator not found");
    }
    if (!admin.totpSecretCiphertext) {
      throw new Error("This platform administrator has not enrolled MFA");
    }
    const now = new Date();
    const sessionVersion = platformSessionVersionTransition(admin);
    const changed = await collections.platformAdmins().updateOne(
      {
        _id: admin._id,
        status: { $ne: "DISABLED" },
        totpSecretCiphertext: admin.totpSecretCiphertext,
        ...sessionVersion.filter,
      },
      {
        $set: {
          totpSecretCiphertext: null,
          pendingTotpSecretCiphertext: null,
          recoveryCodeHashes: [],
          mfaEnrolledAt: null,
          sessionVersion: sessionVersion.next,
          updatedAt: now,
        },
      },
      { session }
    );
    if (!changed.matchedCount) {
      throw new Error("Platform administrator MFA changed; reload and retry");
    }
    await revokeActiveSupportSessions(
      admin._id,
      currentActor.admin._id,
      "platform MFA reset",
      now,
      session
    );
    await insertAdminAudit(
      currentActor,
      { id: admin._id, email: admin.email },
      {
        action: "PLATFORM_ADMIN_MFA_RESET",
        reason: changeReason,
      },
      now,
      session
    );
  });
  revalidatePath("/platform/admins");
}

export async function revokePlatformAdminSessions(
  adminId: string,
  formData: FormData
) {
  const actor = await requirePlatformCapability("admins.manage");
  const changeReason = reason(formData);
  const id = oid(adminId);
  await withPlatformAdminInvariantTransaction(async (session) => {
    const currentActor = await requireCurrentPlatformManager(actor, session);
    const admin =
      currentActor.admin._id.equals(id)
        ? currentActor.admin
        : await collections.platformAdmins().findOne({ _id: id }, { session });
    if (!admin) throw new Error("Platform administrator not found");
    const now = new Date();
    const sessionVersion = platformSessionVersionTransition(admin);
    const changed = await collections.platformAdmins().updateOne(
      { _id: admin._id, ...sessionVersion.filter },
      {
        $set: {
          sessionVersion: sessionVersion.next,
          updatedAt: now,
        },
      },
      { session }
    );
    if (!changed.modifiedCount) {
      throw new Error("Platform administrator state changed; reload and retry");
    }
    await revokeActiveSupportSessions(
      admin._id,
      currentActor.admin._id,
      "platform sessions revoked",
      now,
      session
    );
    await insertAdminAudit(
      currentActor,
      { id: admin._id, email: admin.email },
      {
        action: "PLATFORM_ADMIN_SESSIONS_REVOKED",
        reason: changeReason,
      },
      now,
      session
    );
  });
  revalidatePath("/platform/admins");
}

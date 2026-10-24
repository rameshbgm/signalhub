"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { hashPassword } from "@/lib/auth";
import {
  canonicalizeEmail,
  canonicalizeUsername,
  usernameError,
  MEMBERSHIP_ROLES,
  type MembershipRole,
} from "@/lib/identity";
import { newPasswordError } from "@/lib/password-policy";
import type { DatabaseTransaction } from "@/lib/postgres/client";
import { database } from "@/lib/postgres/client";
import {
  transitionRemovesActiveAdmin,
  withOrganizationAdminInvariantTransaction,
} from "@/lib/team-owner-safety";
import { recordTenantAudit } from "@/lib/tenant-audit";
import { isValidEmail } from "@/lib/input-limits";

export type TeamMemberCreateState = {
  ok: boolean;
  error?: string;
  memberName?: string;
};

type TeamSession = Awaited<ReturnType<typeof requireCapability>>;

async function requireCurrentTeamManager(
  membershipId: string,
  userId: string,
  organizationId: string,
  transaction: DatabaseTransaction
) {
  const membership = await transaction.selectFrom("memberships").selectAll()
    .where("id", "=", membershipId).where("userId", "=", userId)
    .where("orgId", "=", organizationId).where("status", "=", "ACTIVE")
    .where("role", "=", "ADMIN").forUpdate().executeTakeFirst();
  if (!membership) throw new Error("Team-management authorization changed; reload and retry");
  return membership;
}

async function countEnabledActiveAdmins(transaction: DatabaseTransaction) {
  const result = await transaction.selectFrom("memberships as membership")
    .innerJoin("users as user", "user.id", "membership.userId")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("membership.role", "=", "ADMIN")
    .where("membership.status", "=", "ACTIVE")
    .where("user.disabled", "=", false)
    .executeTakeFirstOrThrow();
  return Number(result.count);
}

async function audit(
  transaction: DatabaseTransaction,
  session: TeamSession,
  action: string,
  target: string,
  metadata: unknown,
  now = new Date()
) {
  await recordTenantAudit(transaction, session.orgId, {
    actorEmail: session.email,
    actorId: session.userId,
    actorMembershipRole: session.role,
    action,
    targetType: "membership",
    targetId: target,
    metadata: { ...(metadata && typeof metadata === "object" ? metadata : {}), ...(session.supportSessionId ? { supportSessionId: session.supportSessionId } : {}) },
    createdAt: now,
  });
}

function scopedPages(role: MembershipRole, pageIds: string[]) {
  return role === "ADMIN" || pageIds.length === 0 ? null : pageIds;
}

async function validateInputPages(role: MembershipRole, pageIds: string[], orgId: string) {
  if (["INCIDENT_MANAGER", "RESPONDER", "VIEWER"].includes(role)) {
    for (const pageId of pageIds) await assertPageInOrg(pageId, orgId);
  }
}

export async function createMember(
  _previousState: TeamMemberCreateState,
  formData: FormData
): Promise<TeamMemberCreateState> {
  try {
    const session = await requireCapability("team.manage");
    const email = String(formData.get("email") ?? "").trim();
    const canonicalEmail = canonicalizeEmail(email);
    const username = String(formData.get("username") ?? "").trim();
    const canonicalUsername = canonicalizeUsername(username);
    const name = String(formData.get("name") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const role = String(formData.get("role") ?? "RESPONDER") as MembershipRole;
    const pageIds = [...new Set(formData.getAll("pageIds").map(String).filter(Boolean))];
    if (!isValidEmail(canonicalEmail)) throw new Error("Enter a valid email address");
    const invalidUsername = usernameError(username);
    if (invalidUsername) throw new Error(invalidUsername);
    if (!name || name.length > 120) throw new Error("Enter a name containing at most 120 characters");
    if (!MEMBERSHIP_ROLES.includes(role)) throw new Error("Invalid role");
    if (role === "ADMIN" && session.role !== "ADMIN") throw new Error("Only an Admin can grant administration");
    await validateInputPages(role, pageIds, session.orgId);

    const existingUser = await database.selectFrom("users").selectAll()
      .where("canonicalUsername", "=", canonicalUsername).executeTakeFirst();
    if (existingUser?.disabled) throw new Error("This identity is disabled. A platform administrator must reactivate it first.");
    const identityNeedsPassword = !existingUser?.passwordHash && !(existingUser?.oidcIssuer && existingUser?.oidcSubject);
    let passwordHash: string | null = null;
    if (identityNeedsPassword) {
      const passwordError = newPasswordError(password, [name, username, email]);
      if (passwordError) throw new Error(passwordError);
      passwordHash = await hashPassword(password);
    }

    let memberName = name;
    await withOrganizationAdminInvariantTransaction(session.orgId, async (transaction) => {
      const actorMembership = await requireCurrentTeamManager(session.membershipId, session.userId, session.orgId, transaction);
      if (role === "ADMIN" && actorMembership.role !== "ADMIN") throw new Error("Only an Admin can grant administration");
      const now = new Date();
      let user = await transaction.selectFrom("users").selectAll()
        .where("canonicalUsername", "=", canonicalUsername).forUpdate().executeTakeFirst();
      const newIdentity = !user;
      if (!user) {
        user = await transaction.insertInto("users").values({
          username: canonicalUsername,
          canonicalUsername,
          email,
          canonicalEmail,
          passwordHash,
          name,
          twoFactorEnabled: false,
          oidcIssuer: null,
          oidcSubject: null,
          disabled: false,
          mustChangePassword: Boolean(passwordHash),
          mustCompleteProfile: false,
          sessionVersion: 1,
          mfaRequired: false,
          totpSecretCiphertext: null,
          pendingTotpSecretCiphertext: null,
          recoveryCodeHashes: [],
          mfaEnrolledAt: null,
          createdAt: now,
          updatedAt: now,
        }).returningAll().executeTakeFirstOrThrow();
      } else if (!user.passwordHash && !(user.oidcIssuer && user.oidcSubject) && passwordHash) {
        user = await transaction.updateTable("users").set({ passwordHash, mustChangePassword: true, updatedAt: now })
          .where("id", "=", user.id).where("passwordHash", "is", null).returningAll().executeTakeFirstOrThrow();
      }
      if (user.disabled) throw new Error("This identity is disabled across the platform");
      memberName = user.name;
      const existingMembership = await transaction.selectFrom("memberships").selectAll()
        .where("userId", "=", user.id).where("orgId", "=", session.orgId).forUpdate().executeTakeFirst();
      if (existingMembership && existingMembership.status !== "REVOKED") throw new Error("This user is already a member of the organization");
      const pageScope = scopedPages(role, pageIds);
      const membership = existingMembership
        ? await transaction.updateTable("memberships").set({
            role, status: "ACTIVE", pageIds: pageScope, invitationExpiresAt: null,
            invitationTokenHash: null, activatedAt: now,
          }).where("id", "=", existingMembership.id).where("status", "=", "REVOKED")
            .returningAll().executeTakeFirstOrThrow()
        : await transaction.insertInto("memberships").values({
            orgId: session.orgId, userId: user.id, role, status: "ACTIVE", pageIds: pageScope,
            invitationExpiresAt: null, invitationTokenHash: null, activatedAt: now, createdAt: now,
          }).returningAll().executeTakeFirstOrThrow();
      await audit(transaction, session, existingMembership ? "REACTIVATE_MEMBER_DIRECT" : "CREATE_MEMBER_DIRECT", user.username, {
        membershipId: membership.id, role, pageIds, newIdentity,
        username: user.username, communicationEmail: user.email,
        authentication: user.oidcIssuer ? "SSO" : "PASSWORD",
      }, now);
    });
    revalidatePath("/organization/platform/users");
    revalidatePath("/organization/pages", "layout");
    return { ok: true, memberName };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "User could not be created" };
  }
}

export async function updateMemberRole(membershipId: string, formData: FormData) {
  const session = await requireCapability("team.manage");
  const role = String(formData.get("role") ?? "") as MembershipRole;
  const pageIds = [...new Set(formData.getAll("pageIds").map(String).filter(Boolean))];
  if (!MEMBERSHIP_ROLES.includes(role)) throw new Error("Invalid role");
  await validateInputPages(role, pageIds, session.orgId);
  await withOrganizationAdminInvariantTransaction(session.orgId, async (transaction) => {
    const actor = await requireCurrentTeamManager(session.membershipId, session.userId, session.orgId, transaction);
    const membership = await transaction.selectFrom("memberships").selectAll()
      .where("id", "=", membershipId).where("orgId", "=", session.orgId)
      .where("status", "!=", "REVOKED").forUpdate().executeTakeFirst();
    if (!membership) throw new Error("Active membership not found");
    if ((membership.role === "ADMIN" || role === "ADMIN") && actor.role !== "ADMIN") throw new Error("Only an Admin can change administration");
    const user = await transaction.selectFrom("users").selectAll().where("id", "=", membership.userId).executeTakeFirst();
    if (transitionRemovesActiveAdmin(membership, { role }) && user && !user.disabled && await countEnabledActiveAdmins(transaction) <= 1) {
      throw new Error("The last Admin cannot be demoted");
    }
    const now = new Date();
    const pageScope = scopedPages(role, pageIds);
    await transaction.updateTable("memberships").set({ role, pageIds: pageScope })
      .where("id", "=", membership.id).execute();
    if (membership.role !== role || JSON.stringify(membership.pageIds) !== JSON.stringify(pageScope)) {
      await transaction.updateTable("authSessions").set({ revokedAt: now, revokedReason: "membership-access-changed" })
        .where("membershipId", "=", membership.id).where("revokedAt", "is", null).execute();
    }
    await audit(transaction, session, "UPDATE_MEMBER_ACCESS", user?.email ?? membership.userId, {
      membershipId: membership.id, fromRole: membership.role, toRole: role, pageIds,
    }, now);
  });
  revalidatePath("/organization/platform/users");
}

export async function removeMember(membershipId: string) {
  const session = await requireCapability("team.manage");
  if (membershipId === session.membershipId) throw new Error("You cannot remove yourself");
  await withOrganizationAdminInvariantTransaction(session.orgId, async (transaction) => {
    const actor = await requireCurrentTeamManager(session.membershipId, session.userId, session.orgId, transaction);
    const membership = await transaction.selectFrom("memberships").selectAll()
      .where("id", "=", membershipId).where("orgId", "=", session.orgId)
      .where("status", "!=", "REVOKED").forUpdate().executeTakeFirst();
    if (!membership) throw new Error("Membership not found");
    if (membership.role === "ADMIN" && actor.role !== "ADMIN") throw new Error("Only an Admin can remove another Admin");
    const user = await transaction.selectFrom("users").selectAll().where("id", "=", membership.userId).executeTakeFirst();
    if (transitionRemovesActiveAdmin(membership, { status: "REVOKED" }) && user && !user.disabled && await countEnabledActiveAdmins(transaction) <= 1) {
      throw new Error("The last Admin cannot be removed");
    }
    const now = new Date();
    const changed = await transaction.updateTable("memberships").set({ status: "REVOKED" })
      .where("id", "=", membership.id).where("status", "!=", "REVOKED").returning("id").executeTakeFirst();
    if (!changed) throw new Error("Membership state changed; reload and retry");
    await transaction.updateTable("authSessions").set({ revokedAt: now, revokedReason: "membership-revoked" })
      .where("userId", "=", membership.userId).where("orgId", "=", session.orgId)
      .where("revokedAt", "is", null).execute();
    await audit(transaction, session, "REVOKE_MEMBER", user?.email ?? membership.userId, {
      membershipId: membership.id, role: membership.role,
    }, now);
  });
  revalidatePath("/organization/platform/users");
}

export type RemoveMembersResult = { done: number; failed: Array<{ id: string; message: string }> };

/** Bulk remove for the table: each member is its own transaction, so one that cannot be removed (the last Admin) does not stop the rest. */
export async function removeMembers(membershipIds: string[]): Promise<RemoveMembersResult> {
  const ids = [...new Set(membershipIds)];
  if (ids.length === 0) throw new Error("Select at least one member");
  if (ids.length > 100) throw new Error("Select at most 100 members at a time");
  const result: RemoveMembersResult = { done: 0, failed: [] };
  for (const id of ids) {
    try {
      await removeMember(id);
      result.done += 1;
    } catch (error) {
      unstable_rethrow(error);
      result.failed.push({ id, message: error instanceof Error && error.message.length <= 200 ? error.message : "Could not be removed" });
    }
  }
  return result;
}

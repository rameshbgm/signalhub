"use server";

import { ObjectId, type ClientSession } from "mongodb";
import { revalidatePath } from "next/cache";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { collections } from "@/lib/db";
import {
  canonicalizeEmail,
  MEMBERSHIP_ROLES,
  type MembershipRole,
} from "@/lib/identity";
import { oid } from "@/lib/mongo-utils";
import { generateSecret } from "@/lib/secrets";
import {
  transitionRemovesActiveOwner,
  withOrganizationOwnerInvariantTransaction,
} from "@/lib/team-owner-safety";
import { publicAppUrl } from "@/lib/url";

const INVITATION_LIFETIME_MS = 48 * 60 * 60_000;

export type TeamInviteState = {
  ok: boolean;
  error?: string;
  inviteUrl?: string;
  inviteeName?: string;
  reactivated?: boolean;
};

async function requireCurrentTeamManager(
  membershipId: string,
  userId: string,
  organizationId: ObjectId,
  databaseSession: ClientSession
) {
  const actorMembership = await collections.memberships().findOne(
    {
      _id: oid(membershipId),
      userId: oid(userId),
      orgId: organizationId,
      status: { $nin: ["REVOKED", "INVITED"] },
      role: { $in: ["OWNER", "ADMIN"] },
    },
    { session: databaseSession }
  );
  if (!actorMembership) {
    throw new Error("Team-management authorization changed; reload and retry");
  }
  return actorMembership;
}

async function countEnabledActiveOwners(
  organizationId: ObjectId,
  databaseSession: ClientSession
) {
  const ownerMemberships = await collections
    .memberships()
    .find(
      {
        orgId: organizationId,
        role: "OWNER",
        status: { $nin: ["REVOKED", "INVITED"] },
      },
      {
        projection: { userId: 1 },
        session: databaseSession,
      }
    )
    .toArray();
  if (!ownerMemberships.length) return 0;
  return collections.users().countDocuments(
    {
      _id: { $in: ownerMemberships.map((membership) => membership.userId) },
      disabled: { $ne: true },
    },
    { session: databaseSession }
  );
}

export async function inviteMember(
  _previousState: TeamInviteState,
  formData: FormData
): Promise<TeamInviteState> {
  try {
    const session = await requireCapability("team.manage");
    const email = String(formData.get("email") ?? "").trim();
    const canonicalEmail = canonicalizeEmail(email);
    const name = String(formData.get("name") ?? "").trim();
    const role = String(formData.get("role") ?? "RESPONDER") as MembershipRole;
    const pageIds = [
      ...new Set(formData.getAll("pageIds").map(String).filter(Boolean)),
    ];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(canonicalEmail)) {
      throw new Error("Enter a valid email address");
    }
    if (!name || name.length > 120) {
      throw new Error("Enter a name containing at most 120 characters");
    }
    if (!MEMBERSHIP_ROLES.includes(role)) throw new Error("Invalid role");
    if (role === "OWNER" && session.role !== "OWNER") {
      throw new Error("Only an Owner can grant ownership");
    }
    if (["INCIDENT_MANAGER", "RESPONDER", "VIEWER"].includes(role)) {
      for (const pageId of pageIds) await assertPageInOrg(pageId, session.orgId);
    }

    const baseUrl = publicAppUrl();
    const invitation = generateSecret("org_invite_");
    const now = new Date();
    const invitationExpiresAt = new Date(now.getTime() + INVITATION_LIFETIME_MS);
    const organizationId = oid(session.orgId);
    let inviteeName = name;
    await withOrganizationOwnerInvariantTransaction(
      session.orgId,
      async (dbSession) => {
        const actorMembership = await requireCurrentTeamManager(
          session.membershipId,
          session.userId,
          organizationId,
          dbSession
        );
        if (role === "OWNER" && actorMembership.role !== "OWNER") {
          throw new Error("Only an Owner can grant ownership");
        }

        let user = await collections.users().findOne(
          { canonicalEmail },
          { session: dbSession }
        );
        if (
          user &&
          (await collections.memberships().findOne(
            { userId: user._id, orgId: organizationId },
            { session: dbSession }
          ))
        ) {
          throw new Error("This user is already a member of the organization");
        }
        if (user?.disabled) {
          throw new Error(
            "This user is disabled across the platform. Ask a platform administrator to reactivate the identity first."
          );
        }
        if (user && !user.passwordHash) {
          throw new Error(
            "This existing identity does not have a password. Ask the user to sign in through their identity provider; passwordless identities cannot be invited with a tenant link."
          );
        }

        const existingIdentity = Boolean(user);
        if (!user) {
          const userId = new ObjectId();
          await collections.users().insertOne(
            {
              _id: userId,
              email,
              canonicalEmail,
              passwordHash: null,
              name,
              twoFactorEnabled: false,
              oidcIssuer: null,
              oidcSubject: null,
              disabled: false,
              mustChangePassword: false,
              createdAt: now,
              updatedAt: now,
            },
            { session: dbSession }
          );
          user = await collections.users().findOne(
            { _id: userId },
            { session: dbSession }
          );
        }
        if (!user) throw new Error("Invitee identity could not be created");
        inviteeName = user.name;
        const membershipId = new ObjectId();
        await collections.memberships().insertOne(
          {
            _id: membershipId,
            orgId: organizationId,
            userId: user._id,
            role,
            status: "INVITED",
            pageIds:
              ["OWNER", "ADMIN"].includes(role) || pageIds.length === 0
                ? null
                : pageIds.map(oid),
            invitationExpiresAt,
            invitationTokenHash: invitation.hash,
            activatedAt: null,
            createdAt: now,
          },
          { session: dbSession }
        );
        await collections.auditLogs().insertOne(
          {
            _id: new ObjectId(),
            orgId: organizationId,
            actor: session.email,
            action: "INVITE_MEMBER",
            target: user.email,
            metadata: {
              membershipId: membershipId.toHexString(),
              role,
              existingIdentity,
              pageIds,
              invitationExpiresAt,
            },
            supportSessionId: session.supportSessionId
              ? oid(session.supportSessionId)
              : null,
            createdAt: now,
          },
          { session: dbSession }
        );
      }
    );
    revalidatePath("/admin/team");
    revalidatePath("/admin/pages", "layout");
    return {
      ok: true,
      inviteUrl: `${baseUrl}/invite/${invitation.token}`,
      inviteeName,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invitation failed",
    };
  }
}

export async function updateMemberRole(membershipId: string, formData: FormData) {
  const session = await requireCapability("team.manage");
  const role = String(formData.get("role") ?? "") as MembershipRole;
  const pageIds = [...new Set(formData.getAll("pageIds").map(String).filter(Boolean))];
  if (!MEMBERSHIP_ROLES.includes(role)) throw new Error("Invalid role");
  for (const pageId of pageIds) await assertPageInOrg(pageId, session.orgId);
  const membershipObjectId = oid(membershipId);
  const organizationId = oid(session.orgId);
  const nextPageIds =
    ["OWNER", "ADMIN"].includes(role) || pageIds.length === 0
      ? null
      : pageIds.map(oid);

  await withOrganizationOwnerInvariantTransaction(
    session.orgId,
    async (databaseSession) => {
      const actorMembership = await requireCurrentTeamManager(
        session.membershipId,
        session.userId,
        organizationId,
        databaseSession
      );
      const membership = await collections.memberships().findOne(
        {
          _id: membershipObjectId,
          orgId: organizationId,
          status: { $ne: "REVOKED" },
        },
        { session: databaseSession }
      );
      if (!membership) throw new Error("Active membership not found");
      if (
        (membership.role === "OWNER" || role === "OWNER") &&
        actorMembership.role !== "OWNER"
      ) {
        throw new Error("Only an Owner can change ownership");
      }
      const user = await collections.users().findOne(
        { _id: membership.userId },
        { session: databaseSession }
      );
      if (
        transitionRemovesActiveOwner(membership, { role }) &&
        user &&
        !user.disabled
      ) {
        const ownerCount = await countEnabledActiveOwners(
          organizationId,
          databaseSession
        );
        if (ownerCount <= 1) {
          throw new Error("The last Owner cannot be demoted");
        }
      }

      const now = new Date();
      const changed = await collections.memberships().updateOne(
        {
          _id: membership._id,
          orgId: organizationId,
          status: { $ne: "REVOKED" },
        },
        {
          $set: {
            role,
            pageIds: nextPageIds,
          },
        },
        { session: databaseSession }
      );
      if (!changed.matchedCount) {
        throw new Error("Membership state changed; reload and retry");
      }
      if (membership.role !== role || JSON.stringify(membership.pageIds ?? null) !== JSON.stringify(nextPageIds)) {
        await collections.authSessions().updateMany(
          { membershipId: membership._id, revokedAt: null },
          { $set: { revokedAt: now, revokedReason: "membership-access-changed" } },
          { session: databaseSession }
        );
      }
      await collections.auditLogs().insertOne(
        {
          _id: new ObjectId(),
          orgId: organizationId,
          actor: session.email,
          action: "UPDATE_MEMBER_ACCESS",
          target: user?.email ?? membership.userId.toHexString(),
          metadata: {
            membershipId: membership._id.toHexString(),
            fromRole: membership.role,
            toRole: role,
            pageIds,
          },
          supportSessionId: session.supportSessionId
            ? oid(session.supportSessionId)
            : null,
          createdAt: now,
        },
        { session: databaseSession }
      );
    }
  );
  revalidatePath("/admin/team");
}

export async function removeMember(membershipId: string) {
  const session = await requireCapability("team.manage");
  const membershipObjectId = oid(membershipId);
  if (membershipObjectId.equals(oid(session.membershipId))) {
    throw new Error("You cannot remove yourself");
  }
  const organizationId = oid(session.orgId);

  await withOrganizationOwnerInvariantTransaction(
    session.orgId,
    async (databaseSession) => {
      const actorMembership = await requireCurrentTeamManager(
        session.membershipId,
        session.userId,
        organizationId,
        databaseSession
      );
      const membership = await collections.memberships().findOne(
        {
          _id: membershipObjectId,
          orgId: organizationId,
          status: { $ne: "REVOKED" },
        },
        { session: databaseSession }
      );
      if (!membership) throw new Error("Membership not found");
      if (membership.role === "OWNER") {
        if (actorMembership.role !== "OWNER") {
          throw new Error("Only an Owner can remove another Owner");
        }
      }

      const user = await collections.users().findOne(
        { _id: membership.userId },
        { session: databaseSession }
      );
      if (
        transitionRemovesActiveOwner(membership, { status: "REVOKED" }) &&
        user &&
        !user.disabled
      ) {
        const ownerCount = await countEnabledActiveOwners(
          organizationId,
          databaseSession
        );
        if (ownerCount <= 1) {
          throw new Error("The last Owner cannot be removed");
        }
      }
      const now = new Date();
      const changed = await collections.memberships().updateOne(
        {
          _id: membership._id,
          orgId: organizationId,
          status: { $ne: "REVOKED" },
        },
        { $set: { status: "REVOKED" } },
        { session: databaseSession }
      );
      if (changed.modifiedCount !== 1) {
        throw new Error("Membership state changed; reload and retry");
      }
      await collections.authSessions().updateMany(
        {
          userId: membership.userId,
          orgId: organizationId,
          revokedAt: null,
        },
        { $set: { revokedAt: now, revokedReason: "membership-revoked" } },
        { session: databaseSession }
      );
      await collections.auditLogs().insertOne(
        {
          _id: new ObjectId(),
          orgId: organizationId,
          actor: session.email,
          action: "REVOKE_MEMBER",
          target: user?.email ?? membership.userId.toHexString(),
          metadata: {
            membershipId: membership._id.toHexString(),
            role: membership.role,
          },
          supportSessionId: session.supportSessionId
            ? oid(session.supportSessionId)
            : null,
          createdAt: now,
        },
        { session: databaseSession }
      );
    }
  );
  revalidatePath("/admin/team");
}

export async function reactivateMember(
  membershipId: string,
  _previousState: TeamInviteState,
  _formData: FormData
): Promise<TeamInviteState> {
  try {
    const session = await requireCapability("team.manage");
    const membershipObjectId = oid(membershipId);
    const organizationId = oid(session.orgId);
    let inviteUrl: string | undefined;
    let inviteeName = "Member";
    let reactivated = false;
    await withOrganizationOwnerInvariantTransaction(
      session.orgId,
      async (databaseSession) => {
        const actorMembership = await requireCurrentTeamManager(
          session.membershipId,
          session.userId,
          organizationId,
          databaseSession
        );
        const membership = await collections.memberships().findOne(
          {
            _id: membershipObjectId,
            orgId: organizationId,
          },
          { session: databaseSession }
        );
        if (!membership) throw new Error("Membership not found");
        if (membership.status !== "REVOKED") {
          throw new Error("Only a revoked membership can be reactivated");
        }
        if (
          membership.role === "OWNER" &&
          actorMembership.role !== "OWNER"
        ) {
          throw new Error("Only an Owner can reactivate another Owner");
        }

        const user = await collections.users().findOne(
          { _id: membership.userId },
          { session: databaseSession }
        );
        if (!user) throw new Error("User identity not found");
        if (user.disabled) {
          throw new Error(
            "This user is disabled across the platform. Ask a platform administrator to reactivate the identity first."
          );
        }
        inviteeName = user.name;

        const now = new Date();
        const hasAuthentication = Boolean(
          user.passwordHash || (user.oidcIssuer && user.oidcSubject)
        );
        let action: string;
        let metadata: Record<string, unknown>;
        let nextMembershipState:
          | {
              status: "ACTIVE";
              invitationExpiresAt: null;
              invitationTokenHash: null;
              activatedAt: Date;
            }
          | {
              status: "INVITED";
              invitationExpiresAt: Date;
              invitationTokenHash: string;
              activatedAt: null;
            };

        if (hasAuthentication) {
          nextMembershipState = {
            status: "ACTIVE",
            invitationExpiresAt: null,
            invitationTokenHash: null,
            activatedAt: now,
          };
          action = "REACTIVATE_MEMBER";
          metadata = {
            membershipId: membership._id.toHexString(),
            activationMode: "DIRECT",
          };
          reactivated = true;
        } else {
          const identityMembershipCount = await collections
            .memberships()
            .countDocuments(
              { userId: membership.userId },
              { session: databaseSession }
            );
          if (identityMembershipCount !== 1) {
            throw new Error(
              "This passwordless identity has other organization memberships and cannot be re-invited safely. Ask a platform administrator to resolve the identity."
            );
          }
          const invitation = generateSecret("org_invite_");
          const invitationExpiresAt = new Date(
            now.getTime() + INVITATION_LIFETIME_MS
          );
          inviteUrl = `${publicAppUrl()}/invite/${invitation.token}`;
          nextMembershipState = {
            status: "INVITED",
            invitationExpiresAt,
            invitationTokenHash: invitation.hash,
            activatedAt: null,
          };
          action = "REACTIVATE_MEMBER_INVITATION";
          metadata = {
            membershipId: membership._id.toHexString(),
            activationMode: "INVITATION",
            invitationExpiresAt,
          };
        }

        const result = await collections.memberships().updateOne(
          {
            _id: membership._id,
            orgId: organizationId,
            userId: membership.userId,
            status: "REVOKED",
          },
          { $set: nextMembershipState },
          { session: databaseSession }
        );
        if (result.modifiedCount !== 1) {
          throw new Error("Membership state changed; refresh and try again");
        }

        await collections.auditLogs().insertOne(
          {
            _id: new ObjectId(),
            orgId: organizationId,
            actor: session.email,
            action,
            target: user.email,
            metadata,
            supportSessionId: session.supportSessionId
              ? oid(session.supportSessionId)
              : null,
            createdAt: now,
          },
          { session: databaseSession }
        );
      }
    );
    return {
      ok: true,
      inviteeName,
      ...(inviteUrl ? { inviteUrl } : { reactivated }),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Membership could not be reactivated",
    };
  }
}

export async function regenerateMemberInvite(
  membershipId: string,
  _previousState: TeamInviteState,
  _formData: FormData
): Promise<TeamInviteState> {
  try {
    const session = await requireCapability("team.manage");
    const membershipObjectId = oid(membershipId);
    const organizationId = oid(session.orgId);
    const invitation = generateSecret("org_invite_");
    const baseUrl = publicAppUrl();
    const now = new Date();
    const invitationExpiresAt = new Date(now.getTime() + INVITATION_LIFETIME_MS);
    let inviteeName = "Member";
    await withOrganizationOwnerInvariantTransaction(
      session.orgId,
      async (databaseSession) => {
        const actorMembership = await requireCurrentTeamManager(
          session.membershipId,
          session.userId,
          organizationId,
          databaseSession
        );
        const membership = await collections.memberships().findOne(
          {
            _id: membershipObjectId,
            orgId: organizationId,
          },
          { session: databaseSession }
        );
        if (!membership) throw new Error("Membership not found");
        if (membership.status !== "INVITED") {
          throw new Error("Only a pending invitation can receive a new link");
        }
        if (
          membership.role === "OWNER" &&
          actorMembership.role !== "OWNER"
        ) {
          throw new Error(
            "Only an Owner can replace a pending Owner invitation"
          );
        }

        const user = await collections.users().findOne(
          { _id: membership.userId },
          { session: databaseSession }
        );
        if (!user) throw new Error("User identity not found");
        if (user.disabled) {
          throw new Error(
            "This user is disabled across the platform. Ask a platform administrator to reactivate the identity first."
          );
        }
        inviteeName = user.name;

        const changed = await collections.memberships().updateOne(
          {
            _id: membership._id,
            orgId: organizationId,
            userId: membership.userId,
            status: "INVITED",
          },
          {
            $set: {
              invitationTokenHash: invitation.hash,
              invitationExpiresAt,
              activatedAt: null,
            },
          },
          { session: databaseSession }
        );
        if (changed.matchedCount !== 1) {
          throw new Error("Invitation state changed; refresh and try again");
        }

        await collections.auditLogs().insertOne(
          {
            _id: new ObjectId(),
            orgId: organizationId,
            actor: session.email,
            action: "REISSUE_MEMBER_INVITATION",
            target: user.email,
            metadata: {
              membershipId: membership._id.toHexString(),
              invitationExpiresAt,
            },
            supportSessionId: session.supportSessionId
              ? oid(session.supportSessionId)
              : null,
            createdAt: now,
          },
          { session: databaseSession }
        );
      }
    );
    revalidatePath("/admin/team");
    revalidatePath("/admin/pages", "layout");
    return {
      ok: true,
      inviteUrl: `${baseUrl}/invite/${invitation.token}`,
      inviteeName,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Invitation link could not be created",
    };
  }
}

import { collections, type PageDoc } from "@/lib/db";
import type { Filter } from "mongodb";
import { getSession } from "@/lib/auth";
import { oid, toId } from "@/lib/mongo-utils";
import {
  roleAtLeast,
  sessionHasCapability,
  type Capability,
  type MembershipRole,
} from "@/lib/identity";
import { organizationIsActive } from "@/lib/organization-state";
import {
  hasPlatformCapability,
  type PlatformCapability,
} from "@/lib/platform-policy";
import { AdminAuthError } from "@/lib/admin-auth-error";
import { activePageFilter } from "@/lib/page-lifecycle";

export { AdminAuthError } from "@/lib/admin-auth-error";

export async function requireOrgSession() {
  const session = await getSession();
  if (!session) throw new AdminAuthError("Not authenticated", 401, "UNAUTHENTICATED");

  const organization = await collections.organizations().findOne({
    _id: oid(session.orgId),
  });
  if (!organization || !organizationIsActive(organization)) {
    throw new AdminAuthError("Session is no longer authorized", 401, "SESSION_REVOKED");
  }

  const [membership, user] = await Promise.all([
    collections.memberships().findOne({
      _id: oid(session.membershipId),
      userId: oid(session.userId),
    }),
    collections.users().findOne({ _id: oid(session.userId) }),
  ]);
  if (!membership || !user || user.disabled) {
    throw new AdminAuthError("Session is no longer authorized", 401, "SESSION_REVOKED");
  }
  if (membership.status === "REVOKED") {
    throw new AdminAuthError("Membership has been revoked", 401, "SESSION_REVOKED");
  }
  if (membership.status === "INVITED") {
    throw new AdminAuthError(
      "Accept the pending invitation before signing in",
      401,
      "SESSION_REVOKED"
    );
  }
  if (membership.role !== "ADMIN" && !membership.orgId.equals(oid(session.orgId))) {
    throw new AdminAuthError("This organization is outside your membership", 403, "PAGE_SCOPE_FORBIDDEN");
  }

  return {
    ...session,
    email: user.email,
    name: user.name,
    role: membership.role,
    pageIds: membership.pageIds?.map((pageId) => pageId.toHexString()) ?? null,
    membershipStatus: membership.status ?? "ACTIVE",
    mustChangePassword: Boolean(user.mustChangePassword),
    mustCompleteProfile: Boolean(user.mustCompleteProfile),
    supportActorEmail: undefined,
    supportActorName: undefined,
    supportMode: undefined,
    supportScopes: [] as Capability[],
  };
}

async function requireOrgRole(minimum: MembershipRole) {
  const session = await requireOrgSession();
  if (session.mfaVerified === false) {
    throw new AdminAuthError(
      "Complete multi-factor authentication enrollment before continuing",
      403,
      "MFA_REQUIRED"
    );
  }
  if (session.mustChangePassword) {
    throw new AdminAuthError(
      "Change the temporary password before continuing",
      403,
      "PASSWORD_CHANGE_REQUIRED"
    );
  }
  if (!roleAtLeast(session.role, minimum)) {
    throw new AdminAuthError(`This action requires the ${minimum.toLowerCase()} role`);
  }
  return session;
}

export async function requireCapability(capability: Capability, pageId?: string) {
  const session = await requireOrgSession();
  if (session.mfaVerified === false) {
    throw new AdminAuthError(
      "Complete multi-factor authentication enrollment before continuing",
      403,
      "MFA_REQUIRED"
    );
  }
  if (session.mustChangePassword) {
    throw new AdminAuthError(
      "Change the temporary password before continuing",
      403,
      "PASSWORD_CHANGE_REQUIRED"
    );
  }
  if (!sessionHasCapability(session, capability)) {
    throw new AdminAuthError(`This action requires ${capability.replace(".", " ")} permission`);
  }
  if (
    pageId &&
    session.pageIds !== null &&
    !session.pageIds.includes(pageId) &&
    session.role !== "ADMIN"
  ) {
    throw new AdminAuthError("This page is outside your assigned scope", 403, "PAGE_SCOPE_FORBIDDEN");
  }
  if (pageId) {
    const activePage = await collections.pages().findOne(
      activePageFilter({ _id: oid(pageId), orgId: oid(session.orgId) }),
      { projection: { _id: 1 } }
    );
    if (!activePage) {
      throw new AdminAuthError("Page not found in your organization", 404, "PAGE_NOT_FOUND");
    }
  }
  return session;
}

export { sessionHasCapability } from "@/lib/identity";

export const requireIncidentManager = () => requireOrgRole("INCIDENT_MANAGER");

/**
 * Builds the tenant-and-page boundary for page listings. Admins always
 * see the whole organization; scoped operational roles only see assigned pages.
 */
export function scopedPageFilter(
  session: { role: MembershipRole; pageIds: string[] | null },
  orgId: string,
  extra: Filter<PageDoc> = {}
): Filter<PageDoc> {
  const scopedIds =
    session.role !== "ADMIN" && session.pageIds !== null
      ? { _id: { $in: session.pageIds.map(oid) } }
      : {};
  return activePageFilter({ orgId: oid(orgId), ...scopedIds, ...extra });
}

/** Installation management is a capability of the standard Admin identity. */
export async function requirePlatformSession() {
  const session = await requireOrgSession();
  if (session.role !== "ADMIN") {
    throw new AdminAuthError("Installation administration requires the Admin role", 403, "PLATFORM_PERMISSION_REQUIRED");
  }
  return {
    ...session,
    platformAdminId: session.userId,
    role: "ADMIN" as const,
    sessionVersion: 1,
  };
}

export async function requirePlatformCapability(capability: PlatformCapability) {
  const session = await requirePlatformSession();
  if (!hasPlatformCapability(session.role, capability)) {
    throw new AdminAuthError(
      `This action requires the ${capability.replace(".", " ")} platform permission`,
      403,
      "PLATFORM_PERMISSION_REQUIRED"
    );
  }
  return session;
}

export async function assertPageInOrg(pageId: string, orgId: string) {
  const pageDoc = await collections.pages().findOne(
    activePageFilter({ _id: oid(pageId), orgId: oid(orgId) })
  );
  if (!pageDoc) throw new AdminAuthError("Page not found in your organization", 404, "PAGE_NOT_FOUND");
  const session = await getSession();
  if (session?.orgId === orgId) {
    const membership = await collections.memberships().findOne({
      _id: oid(session.membershipId),
      orgId: oid(orgId),
    });
    if (
      membership &&
      membership.role !== "ADMIN" &&
      membership.pageIds !== null &&
      membership.pageIds !== undefined &&
      !membership.pageIds.some((assignedPageId) => assignedPageId.equals(pageDoc._id))
    ) {
      throw new AdminAuthError("This page is outside your assigned scope", 403, "PAGE_SCOPE_FORBIDDEN");
    }
  }
  return toId(pageDoc);
}

export async function assertComponentInPage(componentId: string, pageId: string) {
  const doc = await collections.components().findOne({ _id: oid(componentId), pageId: oid(pageId) });
  if (!doc) throw new AdminAuthError("Component not found on this page", 404, "COMPONENT_NOT_FOUND");
  return toId(doc);
}

export async function assertGroupInPage(groupId: string, pageId: string) {
  const doc = await collections.componentGroups().findOne({ _id: oid(groupId), pageId: oid(pageId) });
  if (!doc) throw new AdminAuthError("Component group not found on this page", 404, "GROUP_NOT_FOUND");
  return toId(doc);
}

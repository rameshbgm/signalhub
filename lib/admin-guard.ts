import { collections, type PageDoc, type SupportSessionDoc } from "@/lib/db";
import type { Filter } from "mongodb";
import { getSession, getPlatformSession } from "@/lib/auth";
import { oid, toId } from "@/lib/mongo-utils";
import {
  canonicalizeEmail,
  roleAtLeast,
  sessionHasCapability,
  type Capability,
  type MembershipRole,
} from "@/lib/identity";
import { hashSecret } from "@/lib/secrets";
import { organizationIsActive } from "@/lib/organization-state";
import {
  hasPlatformCapability,
  normalizedPlatformRole,
  platformAdminIsActive,
  type PlatformCapability,
} from "@/lib/platform-policy";
import { AdminAuthError } from "@/lib/admin-auth-error";
import { headers } from "next/headers";
import { addressAllowed, trustedClientIp } from "@/lib/network-policy";

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

  if (session.supportSessionId) {
    if (!session.supportSessionToken) {
      throw new AdminAuthError("Support session is invalid", 401, "SUPPORT_SESSION_EXPIRED");
    }
    const supportSessionDoc: SupportSessionDoc | null =
      await collections.supportSessions().findOne({
      _id: oid(session.supportSessionId),
      orgId: oid(session.orgId),
      tokenHash: hashSecret(session.supportSessionToken),
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });
    if (!supportSessionDoc) {
      throw new AdminAuthError("Support session has expired", 401, "SUPPORT_SESSION_EXPIRED");
    }
    const platformAdmin = await collections.platformAdmins().findOne({
      _id: supportSessionDoc.platformAdminId,
    });
    if (!platformAdmin || !platformAdminIsActive(platformAdmin)) {
      throw new AdminAuthError("Support account is no longer authorized", 401, "SUPPORT_SESSION_EXPIRED");
    }
    const supportMode = supportSessionDoc.mode ?? "VIEW";
    const platformRole = normalizedPlatformRole(platformAdmin);
    if (
      !hasPlatformCapability(
        platformRole,
        supportMode === "OPERATE" ? "support.operate" : "support.view"
      )
    ) {
      throw new AdminAuthError(
        "Support account is no longer authorized",
        401,
        "SUPPORT_SESSION_EXPIRED"
      );
    }
    return {
      ...session,
      email: platformAdmin.email,
      name: platformAdmin.name,
      role: supportMode === "OPERATE" ? ("ADMIN" as const) : ("VIEWER" as const),
      pageIds: null,
      membershipStatus: "ACTIVE" as const,
      mustChangePassword: false,
      supportActorEmail: platformAdmin.email,
      supportActorName: platformAdmin.name,
      supportMode,
      supportScopes: supportSessionDoc.scopes ?? [],
    };
  }

  const [membership, user] = await Promise.all([
    collections.memberships().findOne({
      _id: oid(session.membershipId),
      userId: oid(session.userId),
      orgId: oid(session.orgId),
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

  return {
    ...session,
    email: user.email,
    name: user.name,
    role: membership.role,
    pageIds: membership.pageIds?.map((pageId) => pageId.toHexString()) ?? null,
    membershipStatus: membership.status ?? "ACTIVE",
    mustChangePassword: Boolean(user.mustChangePassword),
    supportActorEmail: undefined,
    supportActorName: undefined,
    supportMode: undefined,
    supportScopes: [] as Capability[],
  };
}

export async function requireOrgRole(minimum: MembershipRole) {
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
  if (session.supportActorEmail) {
    if (session.supportMode !== "OPERATE") {
      throw new AdminAuthError(
        "This support session is view-only",
        403,
        "SUPPORT_VIEW_ONLY"
      );
    }
    const requiredScope =
      minimum === "OWNER"
        ? null
        : minimum === "ADMIN"
          ? "organization.manage"
          : minimum === "INCIDENT_MANAGER"
            ? "incident.manage"
            : "component.update";
    if (!requiredScope || !session.supportScopes.includes(requiredScope)) {
      throw new AdminAuthError(
        "This operation is outside the approved support scope",
        403,
        "SUPPORT_SCOPE_FORBIDDEN"
      );
    }
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
    if (session.supportActorEmail) {
      throw new AdminAuthError(
        session.supportMode === "VIEW"
          ? "This support session is view-only"
          : "This operation is outside the approved support scope",
        403,
        session.supportMode === "VIEW"
          ? "SUPPORT_VIEW_ONLY"
          : "SUPPORT_SCOPE_FORBIDDEN"
      );
    }
    throw new AdminAuthError(`This action requires ${capability.replace(".", " ")} permission`);
  }
  if (
    pageId &&
    session.pageIds !== null &&
    !session.pageIds.includes(pageId) &&
    session.role !== "OWNER" &&
    session.role !== "ADMIN"
  ) {
    throw new AdminAuthError("This page is outside your assigned scope", 403, "PAGE_SCOPE_FORBIDDEN");
  }
  return session;
}

export { sessionHasCapability } from "@/lib/identity";

export const requireOrgAdmin = () => requireOrgRole("ADMIN");
export const requireOrgOwner = () => requireOrgRole("OWNER");
export const requireResponder = () => requireOrgRole("RESPONDER");
export const requireIncidentManager = () => requireOrgRole("INCIDENT_MANAGER");

/**
 * Builds the tenant-and-page boundary for page listings. Owners and admins always
 * see the whole organization; scoped operational roles only see assigned pages.
 */
export function scopedPageFilter(
  session: { role: MembershipRole; pageIds: string[] | null },
  orgId: string,
  extra: Filter<PageDoc> = {}
): Filter<PageDoc> {
  const scopedIds =
    !["OWNER", "ADMIN"].includes(session.role) && session.pageIds !== null
      ? { _id: { $in: session.pageIds.map(oid) } }
      : {};
  return { orgId: oid(orgId), ...scopedIds, ...extra };
}

/** Platform gate: spans all tenants, separate identity from org sessions. */
export async function requirePlatformSession() {
  const session = await getPlatformSession();
  if (!session) throw new AdminAuthError("Not authenticated", 401, "UNAUTHENTICATED");
  const admin = await collections.platformAdmins().findOne({
    _id: oid(session.platformAdminId),
  });
  if (
    !admin ||
    canonicalizeEmail(admin.email) !== canonicalizeEmail(session.email) ||
    !platformAdminIsActive(admin) ||
    (admin.sessionVersion ?? 1) !== session.sessionVersion ||
    !admin.totpSecretCiphertext
  ) {
    throw new AdminAuthError(
      "Platform session is no longer authorized",
      401,
      "SESSION_REVOKED"
    );
  }
  const role = normalizedPlatformRole(admin);
  const allowedCidrs = (process.env.PLATFORM_ADMIN_ALLOWED_CIDRS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (allowedCidrs.length) {
    const ip = trustedClientIp(await headers());
    if (!addressAllowed(ip, allowedCidrs)) {
      throw new AdminAuthError(
        "Platform administration is not permitted from this network",
        403,
        "PLATFORM_NETWORK_RESTRICTED"
      );
    }
  }
  return {
    platformAdminId: admin._id.toHexString(),
    email: admin.email,
    name: admin.name,
    role,
    sessionVersion: session.sessionVersion,
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
  const pageDoc = await collections.pages().findOne({ _id: oid(pageId), orgId: oid(orgId) });
  if (!pageDoc) throw new AdminAuthError("Page not found in your organization", 404, "PAGE_NOT_FOUND");
  const session = await getSession();
  if (session?.orgId === orgId) {
    const membership = await collections.memberships().findOne({
      _id: oid(session.membershipId),
      orgId: oid(orgId),
    });
    if (
      membership &&
      !["OWNER", "ADMIN"].includes(membership.role) &&
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

export async function assertIncidentInPage(incidentId: string, pageId: string) {
  const doc = await collections.incidents().findOne({ _id: oid(incidentId), pageId: oid(pageId) });
  if (!doc) throw new AdminAuthError("Incident not found on this page", 404, "INCIDENT_NOT_FOUND");
  return toId(doc);
}

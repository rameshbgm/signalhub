import { effectiveSetting } from "@/lib/settings/effective";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { addressAllowed, trustedClientIp } from "@/lib/network-policy";
import { database } from "@/lib/postgres/client";
import {
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
import { isDatabaseId } from "@/lib/database-id";

export { AdminAuthError } from "@/lib/admin-auth-error";

/** Live identity checks only. Tenant access additionally requires an active organization. */
async function requireIdentitySession() {
  const session = await getSession();
  if (!session) throw new AdminAuthError("Not authenticated", 401, "UNAUTHENTICATED");

  const [membership, user] = await Promise.all([
    database
      .selectFrom("memberships")
      .selectAll()
      .where("id", "=", session.membershipId)
      .where("userId", "=", session.userId)
      .executeTakeFirst(),
    database
      .selectFrom("users")
      .selectAll()
      .where("id", "=", session.userId)
      .executeTakeFirst(),
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
  if (membership.role !== "ADMIN" && membership.orgId !== session.orgId) {
    throw new AdminAuthError("This organization is outside your membership", 403, "PAGE_SCOPE_FORBIDDEN");
  }

  return {
    ...session,
    email: user.email,
    name: user.name,
    role: membership.role,
    pageIds: membership.pageIds ?? null,
    membershipStatus: membership.status ?? "ACTIVE",
    mustChangePassword: Boolean(user.mustChangePassword),
    mustCompleteProfile: Boolean(user.mustCompleteProfile),
    supportActorEmail: undefined,
    supportActorName: undefined,
    supportMode: undefined,
    supportScopes: [] as Capability[],
  };
}

export async function requireOrgSession() {
  const session = await requireIdentitySession();
  const organization = await database.selectFrom("organizations").selectAll()
    .where("id", "=", session.orgId).executeTakeFirst();
  if (!organization || organization.suspended || !organizationIsActive(organization)) {
    throw new AdminAuthError("Session is no longer authorized", 401, "SESSION_REVOKED");
  }
  return session;
}

export function assertSessionReady(session: { mfaVerified?: boolean; mustChangePassword: boolean }) {
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
}

export async function requireReadyOrgSession() {
  const session = await requireOrgSession();
  assertSessionReady(session);
  return session;
}

export async function requireCapability(capability: Capability, pageId?: string) {
  const session = await requireOrgSession();
  assertSessionReady(session);
  if (!sessionHasCapability(session, capability)) {
    throw new AdminAuthError(`This action requires ${capability.replace(".", " ")} permission`);
  }
  // Ids arrive from URLs, forms and bound action args; reject malformed ones before Postgres does.
  if (pageId && !isDatabaseId(pageId)) {
    throw new AdminAuthError("Page not found in your organization", 404, "PAGE_NOT_FOUND");
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
    const activePage = await database
      .selectFrom("pages")
      .select("id")
      .where("id", "=", pageId)
      .where("orgId", "=", session.orgId)
      .where("deletedAt", "is", null)
      .executeTakeFirst();
    if (!activePage) {
      throw new AdminAuthError("Page not found in your organization", 404, "PAGE_NOT_FOUND");
    }
  }
  return session;
}

export { sessionHasCapability } from "@/lib/identity";

/** Loads active pages while enforcing the tenant member's assigned page scope. */
export async function getScopedPages(
  session: { role: MembershipRole; pageIds: string[] | null },
  orgId: string,
  options: { isHub?: boolean; orderBy?: "createdAt" | "name" } = {}
) {
  let query = database
    .selectFrom("pages")
    .selectAll()
    .where("orgId", "=", orgId)
    .where("deletedAt", "is", null);
  if (session.role !== "ADMIN" && session.pageIds !== null) {
    query = query.where("id", "in", session.pageIds);
  }
  if (options.isHub !== undefined) {
    query = query.where("isHub", "=", options.isHub);
  }
  return query.orderBy(options.orderBy ?? "createdAt", "asc").execute();
}

/** Networks allowed to open Platform administration (environment, then the admin setting); empty means no restriction. */
export function platformAdminAllowedCidrs(): string[] {
  return effectiveSetting("adminCidrs").value;
}

/** Installation management is a capability of the standard Admin identity. */
export async function requirePlatformSession() {
  const session = await requireIdentitySession();
  assertSessionReady(session);
  if (session.role !== "ADMIN") {
    throw new AdminAuthError("Installation administration requires the Admin role", 403, "PLATFORM_PERMISSION_REQUIRED");
  }
  const allowedCidrs = platformAdminAllowedCidrs();
  if (allowedCidrs.length && !addressAllowed(trustedClientIp(await headers()), allowedCidrs)) {
    throw new AdminAuthError(
      "Installation administration is not permitted from this network",
      403,
      "PLATFORM_NETWORK_FORBIDDEN"
    );
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
  if (!isDatabaseId(pageId)) throw new AdminAuthError("Page not found in your organization", 404, "PAGE_NOT_FOUND");
  const pageDoc = await database
    .selectFrom("pages")
    .selectAll()
    .where("id", "=", pageId)
    .where("orgId", "=", orgId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!pageDoc) throw new AdminAuthError("Page not found in your organization", 404, "PAGE_NOT_FOUND");
  const session = await getSession();
  if (session?.orgId === orgId) {
    const membership = await database
      .selectFrom("memberships")
      .select(["role", "pageIds"])
      .where("id", "=", session.membershipId)
      .where("orgId", "=", orgId)
      .executeTakeFirst();
    if (
      membership &&
      membership.role !== "ADMIN" &&
      membership.pageIds !== null &&
      membership.pageIds !== undefined &&
      !membership.pageIds.includes(pageDoc.id)
    ) {
      throw new AdminAuthError("This page is outside your assigned scope", 403, "PAGE_SCOPE_FORBIDDEN");
    }
  }
  return pageDoc;
}

export async function assertComponentInPage(componentId: string, pageId: string) {
  if (!isDatabaseId(componentId)) throw new AdminAuthError("Component not found on this page", 404, "COMPONENT_NOT_FOUND");
  const doc = await database
    .selectFrom("components")
    .selectAll()
    .where("id", "=", componentId)
    .where("pageId", "=", pageId)
    .executeTakeFirst();
  if (!doc) throw new AdminAuthError("Component not found on this page", 404, "COMPONENT_NOT_FOUND");
  return doc;
}

export async function assertGroupInPage(groupId: string, pageId: string) {
  if (!isDatabaseId(groupId)) throw new AdminAuthError("Component group not found on this page", 404, "GROUP_NOT_FOUND");
  const doc = await database
    .selectFrom("componentGroups")
    .selectAll()
    .where("id", "=", groupId)
    .where("pageId", "=", pageId)
    .executeTakeFirst();
  if (!doc) throw new AdminAuthError("Component group not found on this page", 404, "GROUP_NOT_FOUND");
  return doc;
}

/** For route segments: a missing, malformed or deleted page renders the 404 page instead of the error screen. */
export async function notFoundIfMissing<T>(load: Promise<T>): Promise<T> {
  try {
    return await load;
  } catch (error) {
    if (error instanceof AdminAuthError && error.status === 404) notFound();
    throw error;
  }
}

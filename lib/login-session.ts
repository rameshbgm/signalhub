import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AdminAuthError } from "@/lib/admin-auth-error";
import { apiError } from "@/lib/api-response";
import { createSession, hashPassword, passwordNeedsRehash } from "@/lib/auth";
import { database } from "@/lib/postgres/client";
import { requestIp } from "@/lib/rate-limit";
import { writeActiveTenantAudit } from "@/lib/tenant-audit";

/**
 * The last step of every password sign-in: pick the organization, record the
 * LOGIN audit entry and create the session. It runs only after the password
 * and, when required, the MFA step have both passed, so a session never exists
 * for someone who is halfway through signing in.
 */
export async function completeLogin(
  request: NextRequest,
  input: { userId: string; orgId?: string; password?: string },
) {
  const user = await database.selectFrom("users").selectAll()
    .where("id", "=", input.userId).where("disabled", "=", false).executeTakeFirst();
  if (!user?.passwordHash) return apiError(401, "INVALID_CREDENTIALS", "Invalid User ID or password");

  const memberships = await database.selectFrom("memberships").selectAll()
    .where("userId", "=", user.id).where("status", "=", "ACTIVE").orderBy("createdAt", "asc").execute();
  if (!memberships.length) return apiError(403, "NO_MEMBERSHIP", "This account does not belong to an organization");

  const globalAdminMembership = memberships.find((item) => item.role === "ADMIN");
  let organizationQuery = database.selectFrom("organizations").selectAll()
    .where("suspended", "=", false).where("status", "=", "ACTIVE");
  if (!globalAdminMembership) {
    organizationQuery = organizationQuery.where("id", "in", memberships.map((membership) => membership.orgId));
  }
  const organizations = await organizationQuery.orderBy("createdAt", "asc").execute();
  const targetOrganization = input.orgId
    ? organizations.find((organization) => organization.id === input.orgId)
    : organizations.find((organization) => globalAdminMembership?.orgId === organization.id) ?? organizations[0];
  const membership = globalAdminMembership ?? memberships.find((item) => targetOrganization && item.orgId === targetOrganization.id);
  if (!membership || !targetOrganization) {
    return apiError(403, "ORGANIZATION_SUSPENDED", "No active organization is available for this account");
  }

  const passwordHash = user.passwordHash;
  const authorized = await writeActiveTenantAudit(targetOrganization.id, {
    actor: user.username, action: "LOGIN", target: "session", metadata: { method: "password" }, createdAt: new Date(),
  }, async (transaction) => {
    const currentUser = await transaction.selectFrom("users").selectAll()
      .where("id", "=", user.id).where("passwordHash", "=", passwordHash).where("disabled", "=", false).executeTakeFirst();
    const currentMembership = await transaction.selectFrom("memberships").selectAll()
      .where("id", "=", membership.id).where("userId", "=", user.id).where("status", "=", "ACTIVE").executeTakeFirst();
    if (!currentUser || !currentMembership) {
      throw new AdminAuthError("Login authorization changed. Sign in again.", 403, "LOGIN_STATE_CHANGED");
    }
    return { user: currentUser, membership: currentMembership };
  });

  if (input.password && passwordNeedsRehash(passwordHash)) {
    await database.updateTable("users").set({ passwordHash: await hashPassword(input.password), updatedAt: new Date() })
      .where("id", "=", authorized.user.id).where("passwordHash", "=", passwordHash).execute();
  }
  await createSession({
    userId: authorized.user.id,
    membershipId: authorized.membership.id,
    orgId: targetOrganization.id,
    username: authorized.user.username,
    email: authorized.user.email,
    name: authorized.user.name,
    role: authorized.membership.role,
  }, { authMethod: "PASSWORD", mfaVerified: true, ipAddress: requestIp(request), userAgent: request.headers.get("user-agent") });

  return NextResponse.json({
    ok: true,
    organizationId: targetOrganization.id,
    organizations: organizations.map((organization) => ({ id: organization.id, name: organization.name })),
    mustChangePassword: authorized.user.mustChangePassword,
    mustCompleteProfile: authorized.user.mustCompleteProfile,
  });
}

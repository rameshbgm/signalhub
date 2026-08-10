import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AdminAuthError } from "@/lib/admin-auth-error";
import { createSession, getSession } from "@/lib/auth";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { database } from "@/lib/postgres/client";
import { writeActiveTenantAudit } from "@/lib/tenant-audit";

const schema = z.object({ orgId: z.string().uuid() });

export async function POST(request: NextRequest) {
  try {
    const current = await getSession();
    if (!current) return apiError(401, "UNAUTHENTICATED", "Sign in before switching organizations");
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);

    const authorityMembership = await database
      .selectFrom("memberships")
      .selectAll()
      .where("id", "=", current.membershipId)
      .where("userId", "=", current.userId)
      .where("status", "=", "ACTIVE")
      .executeTakeFirst();
    if (!authorityMembership) {
      return apiError(403, "MEMBERSHIP_NOT_FOUND", "Account authority is no longer active");
    }
    const membership = authorityMembership.role === "ADMIN"
      ? authorityMembership
      : await database
          .selectFrom("memberships")
          .selectAll()
          .where("userId", "=", current.userId)
          .where("orgId", "=", parsed.data.orgId)
          .where("status", "=", "ACTIVE")
          .executeTakeFirst();
    if (!membership) return apiError(404, "MEMBERSHIP_NOT_FOUND", "Organization membership not found");

    const [user, organization] = await Promise.all([
      database
        .selectFrom("users")
        .selectAll()
        .where("id", "=", membership.userId)
        .where("disabled", "=", false)
        .executeTakeFirst(),
      database
        .selectFrom("organizations")
        .selectAll()
        .where("id", "=", parsed.data.orgId)
        .where("suspended", "=", false)
        .where("status", "=", "ACTIVE")
        .executeTakeFirst(),
    ]);
    if (!user || !organization) {
      return apiError(403, "ORGANIZATION_UNAVAILABLE", "Organization is unavailable");
    }

    const authorized = await writeActiveTenantAudit(
      organization.id,
      {
        actor: user.username,
        action: "SWITCH_ORGANIZATION",
        target: organization.slug,
        createdAt: new Date(),
      },
      async (transaction) => {
        const currentUser = await transaction
          .selectFrom("users")
          .selectAll()
          .where("id", "=", user.id)
          .where("disabled", "=", false)
          .executeTakeFirst();
        const currentMembership = await transaction
          .selectFrom("memberships")
          .selectAll()
          .where("id", "=", membership.id)
          .where("userId", "=", user.id)
          .where("status", "=", "ACTIVE")
          .executeTakeFirst();
        if (!currentUser || !currentMembership) {
          throw new AdminAuthError(
            "Organization access changed. Sign in again.",
            403,
            "SWITCH_STATE_CHANGED"
          );
        }
        return { user: currentUser, membership: currentMembership };
      }
    );
    await createSession({
      userId: authorized.user.id,
      membershipId: authorized.membership.id,
      orgId: organization.id,
      username: authorized.user.username,
      email: authorized.user.email,
      name: authorized.user.name,
      role: authorized.membership.role,
    });
    return NextResponse.json({ ok: true, organizationId: organization.id });
  } catch (error) {
    return routeError(error);
  }
}

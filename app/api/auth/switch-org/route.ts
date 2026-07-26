import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AdminAuthError } from "@/lib/admin-auth-error";
import { createSession, getSession } from "@/lib/auth";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { writeActiveTenantAudit } from "@/lib/tenant-audit";

const schema = z.object({ orgId: z.string() });

export async function POST(request: NextRequest) {
  try {
    const current = await getSession();
    if (!current) return apiError(401, "UNAUTHENTICATED", "Sign in before switching organizations");
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);

    const authorityMembership = await collections.memberships().findOne({
      _id: oid(current.membershipId),
      userId: oid(current.userId),
      status: "ACTIVE",
    });
    if (!authorityMembership) return apiError(403, "MEMBERSHIP_NOT_FOUND", "Account authority is no longer active");
    const membership = authorityMembership.role === "ADMIN"
      ? authorityMembership
      : await collections.memberships().findOne({ userId: oid(current.userId), orgId: oid(parsed.data.orgId), status: "ACTIVE" });
    if (!membership) return apiError(404, "MEMBERSHIP_NOT_FOUND", "Organization membership not found");
    const [user, organization] = await Promise.all([
      collections.users().findOne({ _id: membership.userId, disabled: { $ne: true } }),
      collections.organizations().findOne({
        _id: oid(parsed.data.orgId),
        suspended: { $ne: true },
        status: { $nin: ["PROVISIONING", "SUSPENDED", "DELETING"] },
      }),
    ]);
    if (!user || !organization) return apiError(403, "ORGANIZATION_UNAVAILABLE", "Organization is unavailable");

    const authorized = await writeActiveTenantAudit(
      organization._id,
      {
        actor: user.username,
        action: "SWITCH_ORGANIZATION",
        target: organization.slug,
        createdAt: new Date(),
      },
      async (databaseSession) => {
        const currentUser = await collections.users().findOne(
          { _id: user._id, disabled: { $ne: true } },
          { session: databaseSession }
        );
        const currentMembership = await collections.memberships().findOne(
          { _id: membership._id, userId: user._id, status: "ACTIVE" },
          { session: databaseSession }
        );
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
      userId: authorized.user._id.toHexString(),
      membershipId: authorized.membership._id.toHexString(),
      orgId: organization._id.toHexString(),
      username: authorized.user.username,
      email: authorized.user.email,
      name: authorized.user.name,
      role: authorized.membership.role,
    });
    return NextResponse.json({
      ok: true,
      organizationId: organization._id.toHexString(),
    });
  } catch (error) {
    return routeError(error);
  }
}

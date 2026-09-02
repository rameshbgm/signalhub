import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSession, hashPassword, verifyPassword } from "@/lib/auth";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { fenceActiveOrganizationMutation, OrganizationMutationBlockedError } from "@/lib/organization-mutation";
import { newPasswordError } from "@/lib/password-policy";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import { consumeRateLimit, RateLimitError, requestIp } from "@/lib/rate-limit";
import { hashSecret } from "@/lib/secrets";

const schema = z.object({ password: z.string().min(1).max(1024) });
class InvitationIdentityConflictError extends Error {}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const tokenHash = hashSecret(token);
    await Promise.all([
      consumeRateLimit("accept-invite-ip", requestIp(request), { limit: 20, windowMs: 15 * 60_000 }),
      consumeRateLimit("accept-invite-token", tokenHash, { limit: 8, windowMs: 15 * 60_000 }),
    ]);
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const invite = await database.selectFrom("memberships as membership")
      .innerJoin("users as user", "user.id", "membership.userId")
      .innerJoin("organizations as organization", "organization.id", "membership.orgId")
      .selectAll("membership").select([
        "user.username", "user.email", "user.name", "user.passwordHash", "user.disabled",
        "user.oidcIssuer", "user.oidcSubject", "organization.status as orgStatus", "organization.suspended",
      ]).where("membership.invitationTokenHash", "=", tokenHash).where("membership.status", "=", "INVITED")
      .where("membership.invitationExpiresAt", ">", new Date()).executeTakeFirst();
    if (!invite) return apiError(404, "INVITATION_INVALID", "This invitation is invalid or expired");
    if (invite.disabled || invite.orgStatus !== "ACTIVE" || invite.suspended) {
      return apiError(403, "INVITATION_UNAVAILABLE", "This invitation is no longer available");
    }
    const existingPasswordHash = invite.passwordHash;
    if (existingPasswordHash) {
      if (!(await verifyPassword(parsed.data.password, existingPasswordHash))) return apiError(401, "INVALID_CREDENTIALS", "The password is incorrect");
    } else {
      const policyError = newPasswordError(parsed.data.password, [invite.name, invite.email]);
      if (policyError) return apiError(400, "PASSWORD_POLICY_FAILED", policyError);
    }
    const newPasswordHash = existingPasswordHash ? null : await hashPassword(parsed.data.password);
    const now = new Date();
    await withDatabaseTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(invite.orgId, transaction);
      const membership = await transaction.selectFrom("memberships").selectAll()
        .where("id", "=", invite.id).where("invitationTokenHash", "=", tokenHash)
        .where("status", "=", "INVITED").where("invitationExpiresAt", ">", now).forUpdate().executeTakeFirst();
      const user = await transaction.selectFrom("users").selectAll()
        .where("id", "=", invite.userId).where("disabled", "=", false).forUpdate().executeTakeFirst();
      if (!membership || !user) throw new InvitationIdentityConflictError("The invited identity is no longer available");
      if (existingPasswordHash) {
        if (user.passwordHash !== existingPasswordHash) throw new InvitationIdentityConflictError("The account password changed; reopen the invitation and confirm the current password");
      } else {
        const membershipCount = await transaction.selectFrom("memberships")
          .select((expression) => expression.fn.countAll<number>().as("count"))
          .where("userId", "=", user.id).executeTakeFirstOrThrow();
        if (user.passwordHash || user.oidcIssuer || user.oidcSubject || Number(membershipCount.count) !== 1) {
          throw new InvitationIdentityConflictError("This existing identity must authenticate through its current account before joining another organization");
        }
        const passwordSet = await transaction.updateTable("users").set({
          passwordHash: newPasswordHash!, mustChangePassword: false, updatedAt: now,
        }).where("id", "=", user.id).where("passwordHash", "is", null)
          .where("disabled", "=", false).where("oidcIssuer", "is", null).where("oidcSubject", "is", null)
          .returning("id").executeTakeFirst();
        if (!passwordSet) throw new InvitationIdentityConflictError("The invited identity changed; reopen the invitation and try again");
      }
      const accepted = await transaction.updateTable("memberships").set({
        status: "ACTIVE", activatedAt: now, invitationExpiresAt: null, invitationTokenHash: null,
      }).where("id", "=", membership.id).where("status", "=", "INVITED")
        .returning("id").executeTakeFirst();
      if (!accepted) throw new Error("Invitation was already used");
    });
    await createSession({
      userId: invite.userId, membershipId: invite.id, orgId: invite.orgId,
      username: invite.username, email: invite.email, name: invite.name, role: invite.role,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RateLimitError) {
      const response = apiError(429, "RATE_LIMITED", "Too many invitation attempts");
      response.headers.set("retry-after", String(error.retryAfterSeconds));
      return response;
    }
    if (error instanceof InvitationIdentityConflictError) return apiError(409, "INVITATION_IDENTITY_CONFLICT", error.message);
    if (error instanceof OrganizationMutationBlockedError) return apiError(403, "INVITATION_UNAVAILABLE", "This invitation is no longer available");
    return routeError(error, { route: "POST /api/auth/accept-invite/:token" });
  }
}

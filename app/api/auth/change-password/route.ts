import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AdminAuthError } from "@/lib/admin-auth-error";
import { destroySession, getSession, hashPassword, verifyPassword } from "@/lib/auth";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { newPasswordError } from "@/lib/password-policy";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";

const schema = z.object({ currentPassword: z.string().min(1).max(1024), newPassword: z.string().min(1).max(1024), email: z.string().email() });

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return apiError(401, "UNAUTHENTICATED", "Sign in first");
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const user = await database.selectFrom("users").selectAll().where("id", "=", session.userId).executeTakeFirst();
    if (!user?.passwordHash || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
      return apiError(400, "INVALID_CURRENT_PASSWORD", "The temporary password is incorrect");
    }
    const email = parsed.data.email.trim().toLowerCase();
    const passwordError = newPasswordError(parsed.data.newPassword, [user.name, user.username, email]);
    if (passwordError) return apiError(400, "PASSWORD_POLICY_FAILED", passwordError);
    if (await verifyPassword(parsed.data.newPassword, user.passwordHash)) return apiError(400, "PASSWORD_REUSED", "Choose a different password");
    const now = new Date();
    const passwordHash = await hashPassword(parsed.data.newPassword);
    await withDatabaseTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(session.orgId, transaction);
      const membership = await transaction.selectFrom("memberships").selectAll()
        .where("id", "=", session.membershipId).where("userId", "=", user.id)
        .where("orgId", "=", session.orgId).where("status", "=", "ACTIVE").forUpdate().executeTakeFirst();
      if (!membership) throw new AdminAuthError("Session is no longer authorized", 401, "SESSION_REVOKED");
      const changed = await transaction.updateTable("users").set({
        passwordHash, email, canonicalEmail: email, mustChangePassword: false,
        mustCompleteProfile: false, updatedAt: now,
      }).where("id", "=", user.id).where("passwordHash", "=", user.passwordHash)
        .where("disabled", "=", false).returning("id").executeTakeFirst();
      if (!changed) throw new AdminAuthError("Account credentials changed. Sign in again.", 401, "SESSION_REVOKED");
      await transaction.updateTable("authSessions").set({ revokedAt: now, revokedReason: "password-changed" })
        .where("userId", "=", user.id).where("revokedAt", "is", null).execute();
      await transaction.updateTable("memberships").set({ invitationExpiresAt: null, activatedAt: now })
        .where("id", "=", membership.id).where("status", "=", "ACTIVE").execute();
      await transaction.insertInto("auditLogs").values({
        orgId: membership.orgId, actor: user.username, action: "INITIAL_ACCOUNT_SETUP_COMPLETED",
        target: user.id, metadata: { communicationEmail: email }, createdAt: now,
      }).execute();
    });
    await destroySession();
    return NextResponse.json({ ok: true, signInRequired: true });
  } catch (error) {
    return routeError(error, { route: "POST /api/auth/change-password" });
  }
}

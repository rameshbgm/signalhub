import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AdminAuthError } from "@/lib/admin-auth-error";
import { destroySession, getSession, hashPassword, verifyPassword } from "@/lib/auth";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { collections, mongoClient } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { newPasswordError } from "@/lib/password-policy";

const schema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(1).max(1024),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return apiError(401, "UNAUTHENTICATED", "Sign in first");
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const user = await collections.users().findOne({ _id: oid(session.userId) });
    if (
      !user?.passwordHash ||
      !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))
    ) {
      return apiError(400, "INVALID_CURRENT_PASSWORD", "The temporary password is incorrect");
    }
    const passwordError = newPasswordError(parsed.data.newPassword, [user.name, user.email]);
    if (passwordError) return apiError(400, "PASSWORD_POLICY_FAILED", passwordError);
    if (await verifyPassword(parsed.data.newPassword, user.passwordHash)) {
      return apiError(400, "PASSWORD_REUSED", "Choose a different password");
    }
    const now = new Date();
    const passwordHash = await hashPassword(parsed.data.newPassword);
    const databaseSession = mongoClient.startSession();
    try {
      await databaseSession.withTransaction(async () => {
        await fenceActiveOrganizationMutation(
          session.orgId,
          databaseSession
        );
        const membership = await collections.memberships().findOne(
          {
            _id: oid(session.membershipId),
            userId: user._id,
            orgId: oid(session.orgId),
            status: "ACTIVE",
          },
          { session: databaseSession }
        );
        if (!membership) {
          throw new AdminAuthError(
            "Session is no longer authorized",
            401,
            "SESSION_REVOKED"
          );
        }
        const changed = await collections.users().updateOne(
          {
            _id: user._id,
            passwordHash: user.passwordHash,
            disabled: { $ne: true },
          },
          {
            $set: {
              passwordHash,
              mustChangePassword: false,
              updatedAt: now,
            },
          },
          { session: databaseSession }
        );
        if (!changed.modifiedCount) {
          throw new AdminAuthError(
            "Account credentials changed. Sign in again.",
            401,
            "SESSION_REVOKED"
          );
        }
        await collections.authSessions().updateMany(
          { userId: user._id, revokedAt: null },
          { $set: { revokedAt: now, revokedReason: "password-changed" } },
          { session: databaseSession }
        );
        await collections.memberships().updateOne(
          { _id: membership._id, status: "ACTIVE" },
          {
            $set: {
              invitationExpiresAt: null,
              activatedAt: now,
            },
          },
          { session: databaseSession }
        );
        await collections.auditLogs().insertOne(
          {
            _id: new ObjectId(),
            orgId: membership.orgId,
            actor: user.email,
            action: "PASSWORD_CHANGED",
            target: user._id.toHexString(),
            createdAt: now,
          },
          { session: databaseSession }
        );
      });
    } finally {
      await databaseSession.endSession();
    }
    await destroySession();
    return NextResponse.json({ ok: true, signInRequired: true });
  } catch (error) {
    return routeError(error);
  }
}

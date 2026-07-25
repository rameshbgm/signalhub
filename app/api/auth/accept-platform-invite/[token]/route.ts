import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { collections, mongoClient } from "@/lib/db";
import { hashSecret } from "@/lib/secrets";
import { consumeRateLimit, RateLimitError, requestIp } from "@/lib/rate-limit";
import { newPasswordError } from "@/lib/password-policy";

const schema = z.object({ password: z.string().min(1).max(1024) });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const tokenHash = hashSecret(token);
    await Promise.all([
      consumeRateLimit("platform-invite-ip", requestIp(request), {
        limit: 20,
        windowMs: 15 * 60_000,
      }),
      consumeRateLimit("platform-invite-token", tokenHash, {
        limit: 8,
        windowMs: 15 * 60_000,
      }),
    ]);
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const invitation = await collections.platformInvites().findOne({
      tokenHash,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });
    if (!invitation) {
      return apiError(404, "INVITATION_INVALID", "This invitation is invalid or expired");
    }
    const passwordError = newPasswordError(parsed.data.password, [invitation.name, invitation.email]);
    if (passwordError) return apiError(400, "PASSWORD_POLICY_FAILED", passwordError);
    if (await collections.platformAdmins().findOne({ canonicalEmail: invitation.canonicalEmail })) {
      return apiError(409, "ACCOUNT_EXISTS", "A platform account already exists for this email");
    }
    const adminId = new ObjectId();
    const now = new Date();
    const databaseSession = mongoClient.startSession();
    try {
      await databaseSession.withTransaction(async () => {
        await collections.platformAdmins().insertOne(
          {
            _id: adminId,
            email: invitation.email,
            canonicalEmail: invitation.canonicalEmail,
            passwordHash: await hashPassword(parsed.data.password),
            name: invitation.name,
            role: invitation.role,
            status: "ACTIVE",
            sessionVersion: 1,
            totpSecretCiphertext: null,
            pendingTotpSecretCiphertext: null,
            recoveryCodeHashes: [],
            mfaEnrolledAt: null,
            lastLoginAt: null,
            disabledAt: null,
            disabledBy: null,
            createdAt: now,
            updatedAt: now,
          },
          { session: databaseSession }
        );
        const accepted = await collections.platformInvites().updateOne(
          {
            _id: invitation._id,
            tokenHash,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { $gt: now },
          },
          { $set: { acceptedAt: now } },
          { session: databaseSession }
        );
        if (!accepted.modifiedCount) throw new Error("Invitation was already used");
        await collections.platformAuditLogs().insertOne(
          {
            _id: new ObjectId(),
            actorId: adminId,
            actorEmail: invitation.email,
            actorRole: invitation.role,
            action: "PLATFORM_ADMIN_INVITATION_ACCEPTED",
            targetType: "platformAdmin",
            targetId: adminId.toHexString(),
            organizationId: null,
            reason: null,
            metadata: { inviteId: invitation._id.toHexString() },
            createdAt: now,
          },
          { session: databaseSession }
        );
      });
    } finally {
      await databaseSession.endSession();
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RateLimitError) {
      const response = apiError(429, "RATE_LIMITED", "Too many invitation attempts");
      response.headers.set("retry-after", String(error.retryAfterSeconds));
      return response;
    }
    return routeError(error);
  }
}

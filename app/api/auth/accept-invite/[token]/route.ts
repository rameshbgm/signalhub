import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSession, hashPassword, verifyPassword } from "@/lib/auth";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { collections, mongoClient } from "@/lib/db";
import { organizationIsActive } from "@/lib/organization-state";
import {
  fenceActiveOrganizationMutation,
  OrganizationMutationBlockedError,
} from "@/lib/organization-mutation";
import { consumeRateLimit, RateLimitError, requestIp } from "@/lib/rate-limit";
import { hashSecret } from "@/lib/secrets";
import { newPasswordError } from "@/lib/password-policy";

const schema = z.object({ password: z.string().min(1).max(1024) });

class InvitationIdentityConflictError extends Error {}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const tokenHash = hashSecret(token);
    await Promise.all([
      consumeRateLimit("accept-invite-ip", requestIp(request), {
        limit: 20,
        windowMs: 15 * 60_000,
      }),
      consumeRateLimit("accept-invite-token", tokenHash, {
        limit: 8,
        windowMs: 15 * 60_000,
      }),
    ]);
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const membership = await collections.memberships().findOne({
      invitationTokenHash: tokenHash,
      status: "INVITED",
      invitationExpiresAt: { $gt: new Date() },
    });
    if (!membership) {
      return apiError(404, "INVITATION_INVALID", "This invitation is invalid or expired");
    }
    const [user, organization] = await Promise.all([
      collections.users().findOne({ _id: membership.userId }),
      collections.organizations().findOne({ _id: membership.orgId }),
    ]);
    if (!user || user.disabled || !organization || !organizationIsActive(organization)) {
      return apiError(403, "INVITATION_UNAVAILABLE", "This invitation is no longer available");
    }
    const existingPasswordHash = user.passwordHash;
    if (existingPasswordHash) {
      if (!(await verifyPassword(parsed.data.password, existingPasswordHash))) {
        return apiError(401, "INVALID_CREDENTIALS", "The password is incorrect");
      }
    } else if (newPasswordError(parsed.data.password, [user.name, user.email])) {
      return apiError(
        400,
        "PASSWORD_POLICY_FAILED",
        newPasswordError(parsed.data.password, [user.name, user.email])!
      );
    }
    const newPasswordHash = existingPasswordHash
      ? null
      : await hashPassword(parsed.data.password);
    const now = new Date();
    const databaseSession = mongoClient.startSession();
    try {
      await databaseSession.withTransaction(async () => {
        await fenceActiveOrganizationMutation(
          membership.orgId,
          databaseSession
        );
        const currentUser = await collections.users().findOne(
          { _id: user._id, disabled: { $ne: true } },
          { session: databaseSession }
        );
        if (!currentUser) {
          throw new InvitationIdentityConflictError(
            "The invited identity is no longer available"
          );
        }
        if (existingPasswordHash) {
          if (currentUser.passwordHash !== existingPasswordHash) {
            throw new InvitationIdentityConflictError(
              "The account password changed; reopen the invitation and confirm the current password"
            );
          }
        } else {
          const identityMembershipCount = await collections
            .memberships()
            .countDocuments(
              { userId: user._id },
              { session: databaseSession }
            );
          if (
            currentUser.passwordHash ||
            currentUser.oidcIssuer ||
            currentUser.oidcSubject ||
            identityMembershipCount !== 1
          ) {
            throw new InvitationIdentityConflictError(
              "This existing identity must authenticate through its current account before joining another organization"
            );
          }
          const passwordSet = await collections.users().updateOne(
            {
              _id: user._id,
              passwordHash: null,
              disabled: { $ne: true },
              oidcIssuer: { $in: [null] },
              oidcSubject: { $in: [null] },
            },
            {
              $set: {
                passwordHash: newPasswordHash!,
                mustChangePassword: false,
                updatedAt: now,
              },
            },
            { session: databaseSession }
          );
          if (passwordSet.modifiedCount !== 1) {
            throw new InvitationIdentityConflictError(
              "The invited identity changed; reopen the invitation and try again"
            );
          }
        }
        const accepted = await collections.memberships().updateOne(
          {
            _id: membership._id,
            invitationTokenHash: tokenHash,
            status: "INVITED",
            invitationExpiresAt: { $gt: now },
          },
          {
            $set: {
              status: "ACTIVE",
              activatedAt: now,
              invitationExpiresAt: null,
              invitationTokenHash: null,
            },
          },
          { session: databaseSession }
        );
        if (!accepted.modifiedCount) throw new Error("Invitation was already used");
        await collections.auditLogs().insertOne(
          {
            _id: new ObjectId(),
            orgId: membership.orgId,
            actor: user.email,
            action: "ORGANIZATION_INVITATION_ACCEPTED",
            target: membership._id.toHexString(),
            metadata: null,
            createdAt: now,
          },
          { session: databaseSession }
        );
      });
    } finally {
      await databaseSession.endSession();
    }
    await createSession({
      userId: user._id.toHexString(),
      membershipId: membership._id.toHexString(),
      orgId: membership.orgId.toHexString(),
      email: user.email,
      name: user.name,
      role: membership.role,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RateLimitError) {
      const response = apiError(429, "RATE_LIMITED", "Too many invitation attempts");
      response.headers.set("retry-after", String(error.retryAfterSeconds));
      return response;
    }
    if (error instanceof InvitationIdentityConflictError) {
      return apiError(409, "INVITATION_IDENTITY_CONFLICT", error.message);
    }
    if (error instanceof OrganizationMutationBlockedError) {
      return apiError(
        403,
        "INVITATION_UNAVAILABLE",
        "This invitation is no longer available"
      );
    }
    return routeError(error);
  }
}

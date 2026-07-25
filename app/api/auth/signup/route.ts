import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSession, hashPassword } from "@/lib/auth";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { collections, mongoClient } from "@/lib/db";
import { canonicalizeEmail } from "@/lib/identity";
import { consumeRateLimit, RateLimitError, requestIp } from "@/lib/rate-limit";
import { newPasswordError } from "@/lib/password-policy";

const schema = z.object({
  orgName: z.string().trim().min(2).max(80),
  name: z.string().trim().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(1).max(1024),
});

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function POST(request: NextRequest) {
  try {
    if (process.env.ALLOW_PUBLIC_SIGNUP !== "true") {
      return apiError(403, "SIGNUP_DISABLED", "Public signup is disabled on this SignalHub deployment");
    }

    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const passwordError = newPasswordError(parsed.data.password, [parsed.data.name, parsed.data.email]);
    if (passwordError) return apiError(400, "PASSWORD_POLICY_FAILED", passwordError);
    await consumeRateLimit("signup", requestIp(request), { limit: 5, windowMs: 60 * 60_000 });

    const canonicalEmail = canonicalizeEmail(parsed.data.email);
    if (await collections.users().findOne({ canonicalEmail })) {
      return apiError(409, "ACCOUNT_EXISTS", "An account with this email already exists");
    }

    let slug = slugify(parsed.data.orgName) || "organization";
    if (await collections.organizations().findOne({ slug })) {
      slug = `${slug}-${randomBytes(3).toString("hex")}`;
    }

    const orgId = new ObjectId();
    const userId = new ObjectId();
    const membershipId = new ObjectId();
    const now = new Date();
    const passwordHash = await hashPassword(parsed.data.password);
    const session = mongoClient.startSession();
    try {
      await session.withTransaction(async () => {
        await collections.organizations().insertOne(
          {
            _id: orgId,
            name: parsed.data.orgName,
            slug,
            contactEmail: canonicalEmail,
            suspended: false,
            status: "ACTIVE",
            statusReason: null,
            statusChangedAt: now,
            statusChangedBy: null,
            createdAt: now,
            updatedAt: now,
          },
          { session }
        );
        await collections.users().insertOne(
          {
            _id: userId,
            email: parsed.data.email.trim(),
            canonicalEmail,
            passwordHash,
            name: parsed.data.name,
            twoFactorEnabled: false,
            oidcIssuer: null,
            oidcSubject: null,
            disabled: false,
            createdAt: now,
            updatedAt: now,
          },
          { session }
        );
        await collections.memberships().insertOne(
          {
            _id: membershipId,
            orgId,
            userId,
            role: "OWNER",
            status: "ACTIVE",
            pageIds: null,
            invitationExpiresAt: null,
            invitationTokenHash: null,
            activatedAt: now,
            createdAt: now,
          },
          { session }
        );
        await collections.auditLogs().insertOne(
          {
            _id: new ObjectId(),
            orgId,
            actor: parsed.data.email.trim(),
            action: "SIGNUP",
            target: slug,
            metadata: { method: "password" },
            createdAt: now,
          },
          { session }
        );
      });
    } finally {
      await session.endSession();
    }

    await createSession({
      userId: userId.toHexString(),
      membershipId: membershipId.toHexString(),
      orgId: orgId.toHexString(),
      email: parsed.data.email.trim(),
      name: parsed.data.name,
      role: "OWNER",
    });
    return NextResponse.json({ ok: true, organizationId: orgId.toHexString() }, { status: 201 });
  } catch (error) {
    if (error instanceof RateLimitError) {
      const response = apiError(429, "RATE_LIMITED", "Too many signup attempts. Try again later.");
      response.headers.set("retry-after", String(error.retryAfterSeconds));
      return response;
    }
    return routeError(error);
  }
}

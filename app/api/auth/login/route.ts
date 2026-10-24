import { readRequestJson } from "@/lib/request-body";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyPassword } from "@/lib/auth";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { canonicalizeUsername } from "@/lib/identity";
import { completeLogin } from "@/lib/login-session";
import { setChallengeCookie, trustToken } from "@/lib/mfa/http";
import { createChallenge, isTrustedDevice, mfaStatus } from "@/lib/mfa/service";
import { database } from "@/lib/postgres/client";
import { consumeNamedLimit, RateLimitError, requestIp } from "@/lib/rate-limit";
import { setting } from "@/lib/settings/effective";

const databaseIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const schema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(1).max(1024),
  orgId: z.string().regex(databaseIdPattern).optional(),
});

/**
 * Step 1 of sign-in: the password. With MFA on (Platform > Configuration > Runtime), someone
 * who still owes a code gets a short-lived challenge cookie and HTTP 202, and no
 * session at all until /api/auth/login/mfa or the enrollment flow completes.
 */
export async function POST(request: NextRequest) {
  try {
    const requestBody = await readRequestJson(request);
    if (requestBody instanceof Response) return requestBody;
    const parsed = schema.safeParse(requestBody);
    if (!parsed.success) return validationError(parsed.error);

    const canonicalUsername = canonicalizeUsername(parsed.data.username);
    await consumeNamedLimit("login-ip", requestIp(request));
    await consumeNamedLimit("login-account", canonicalUsername);

    const user = await database.selectFrom("users").select(["id", "passwordHash", "disabled"])
      .where("canonicalUsername", "=", canonicalUsername).executeTakeFirst();
    if (!user?.passwordHash || user.disabled || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return apiError(401, "INVALID_CREDENTIALS", "Invalid User ID or password");
    }

    if (setting("mfaEnabled")) {
      const status = await mfaStatus(user.id);
      const enrolled = status.devices.length > 0 && !status.reenrollRequired;
      if (!enrolled || !(await isTrustedDevice(user.id, trustToken(request)))) {
        const { token, ttlSeconds } = await createChallenge(user.id, enrolled ? "CODE" : "ENROLL", {
          orgId: parsed.data.orgId, ip: requestIp(request),
        });
        const response = NextResponse.json({ ok: false, mfa: { step: enrolled ? "code" : "enroll" } }, { status: 202 });
        await setChallengeCookie(response, token, ttlSeconds);
        return response;
      }
    }

    return await completeLogin(request, { userId: user.id, orgId: parsed.data.orgId, password: parsed.data.password });
  } catch (error) {
    if (error instanceof RateLimitError) {
      const response = apiError(429, "RATE_LIMITED", "Too many login attempts. Try again later.");
      response.headers.set("retry-after", String(error.retryAfterSeconds));
      return response;
    }
    return routeError(error);
  }
}

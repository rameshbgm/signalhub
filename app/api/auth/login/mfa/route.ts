import { readRequestJson } from "@/lib/request-body";
import { after, NextRequest } from "next/server";
import { z } from "zod";
import { apiError, validationError } from "@/lib/api-response";
import { completeLogin } from "@/lib/login-session";
import { challengeToken, clearChallengeCookie, mfaRouteError, setTrustCookie } from "@/lib/mfa/http";
import { sendMfaMail } from "@/lib/mfa/mail";
import { createTrustedDevice, deleteChallenge, findChallenge, verifyCode, verifyFailure } from "@/lib/mfa/service";
import { database } from "@/lib/postgres/client";
import { consumeNamedLimit, requestIp } from "@/lib/rate-limit";

const schema = z.object({
  code: z.string().trim().max(32).optional(),
  recoveryCode: z.string().trim().max(32).optional(),
  trustDevice: z.boolean().optional(),
}).refine((value) => Boolean(value.code) !== Boolean(value.recoveryCode), { message: "Send either a code or a recovery code" });

/** Step 2 of sign-in: an authenticator code or a recovery code, against the challenge from step 1. */
export async function POST(request: NextRequest) {
  try {
    const requestBody = await readRequestJson(request);
    if (requestBody instanceof Response) return requestBody;
    const parsed = schema.safeParse(requestBody);
    if (!parsed.success) return validationError(parsed.error);
    const challenge = await findChallenge(challengeToken(request));
    if (!challenge || challenge.kind !== "CODE") {
      return apiError(401, "MFA_CHALLENGE_EXPIRED", "Your sign-in timed out. Enter your password again.");
    }
    await Promise.all([
      consumeNamedLimit("mfa-ip", requestIp(request)),
      consumeNamedLimit("mfa-account", challenge.userId, "login"),
    ]);

    const result = await verifyCode(challenge.userId, { code: parsed.data.code, recoveryCode: parsed.data.recoveryCode });
    if (!result.ok) throw verifyFailure(result);

    const user = await database.selectFrom("users").select(["id", "email", "name", "username"]).where("id", "=", challenge.userId).executeTakeFirstOrThrow();
    const response = await completeLogin(request, { userId: user.id, orgId: challenge.orgId ?? undefined });
    if (!response.ok) return response;
    await deleteChallenge(challenge.id);
    clearChallengeCookie(response);

    if (parsed.data.trustDevice) {
      const trusted = await createTrustedDevice(user, { userAgent: request.headers.get("user-agent"), ip: requestIp(request) });
      await setTrustCookie(response, trusted.token, trusted.expiresAt);
    }
    if (result.method === "recovery") {
      after(() => sendMfaMail(user.email, user.name || user.username, { kind: "recovery-used", remaining: result.recoveryRemaining ?? 0 }));
    }
    return response;
  } catch (error) {
    return mfaRouteError(error, "POST /api/auth/login/mfa");
  }
}

import { readRequestJson } from "@/lib/request-body";
import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyPassword } from "@/lib/auth";
import { validationError } from "@/lib/api-response";
import { canonicalizeEmail, canonicalizeUsername } from "@/lib/identity";
import { errorFields, logger } from "@/lib/logger";
import { mfaRouteError } from "@/lib/mfa/http";
import { createRequest, notifyRequestCreated } from "@/lib/mfa/requests";
import { mfaStatus } from "@/lib/mfa/service";
import { database } from "@/lib/postgres/client";
import { consumeNamedLimit, requestIp } from "@/lib/rate-limit";
import { setting } from "@/lib/settings/effective";

const schema = z.object({
  identifier: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(1024),
  reason: z.string().trim().min(5).max(500),
});

/** Shown whether or not the account exists, the password was right, or a request was filed. */
const GENERIC = "If those details match an account, an administrator has been asked to review your request and the account owner was emailed. You can cancel it from that email.";

/**
 * "I lost my device", for someone who cannot sign in. The reply never changes,
 * so the form cannot be used to find out which accounts exist. The work happens
 * after the response, and a request is filed only for a correct password.
 */
export async function POST(request: NextRequest) {
  try {
    const requestBody = await readRequestJson(request);
    if (requestBody instanceof Response) return requestBody;
    const parsed = schema.safeParse(requestBody);
    if (!parsed.success) return validationError(parsed.error);
    const input = parsed.data;
    await consumeNamedLimit("mfa-request-ip", requestIp(request));
    await consumeNamedLimit("mfa-request-account", input.identifier.toLowerCase());
    const meta = { ip: requestIp(request), userAgent: request.headers.get("user-agent") };

    after(async () => {
      try {
        const identifier = input.identifier;
        const query = database.selectFrom("users").select(["id", "email", "name", "username", "passwordHash", "disabled"]);
        const user = await (identifier.includes("@")
          ? query.where("canonicalEmail", "=", canonicalizeEmail(identifier))
          : query.where("canonicalUsername", "=", canonicalizeUsername(identifier))).executeTakeFirst();
        if (!user?.passwordHash || user.disabled || !(await verifyPassword(input.password, user.passwordHash))) return;
        if (!setting("mfaEnabled") || (await mfaStatus(user.id)).devices.length === 0) return;
        const created = await createRequest(user, { type: "LOST_DEVICE", reason: input.reason, ...meta });
        await notifyRequestCreated(user, created, "LOST_DEVICE");
      } catch (error) {
        // An existing request or a cooldown looks the same to the caller by design.
        logger.info({ ...errorFields(error) }, "MFA removal request not filed");
      }
    });
    return NextResponse.json({ ok: true, message: GENERIC });
  } catch (error) {
    return mfaRouteError(error, "POST /api/auth/mfa/request");
  }
}

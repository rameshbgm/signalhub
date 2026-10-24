import { readRequestJson } from "@/lib/request-body";
import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { canonicalizeEmail } from "@/lib/identity";
import { passwordResetByEmailAvailable, requestPasswordReset } from "@/lib/password-reset";
import { consumeNamedLimit, RateLimitError, requestIp } from "@/lib/rate-limit";

const schema = z.object({ identifier: z.string().trim().min(3).max(320) });

/**
 * Always answers the same way for known and unknown accounts; the email is
 * sent after the response so timing does not reveal accounts either.
 */
export async function POST(request: NextRequest) {
  try {
    const requestBody = await readRequestJson(request);
    if (requestBody instanceof Response) return requestBody;
    const parsed = schema.safeParse(requestBody);
    if (!parsed.success) return validationError(parsed.error);
    const ip = requestIp(request);
    await consumeNamedLimit("password-reset-ip", ip);
    await consumeNamedLimit("password-reset-account", canonicalizeEmail(parsed.data.identifier));
    const emailAvailable = await passwordResetByEmailAvailable();
    if (emailAvailable) after(() => requestPasswordReset(parsed.data.identifier, ip === "unknown" ? null : ip));
    return NextResponse.json({ ok: true, emailAvailable });
  } catch (error) {
    if (error instanceof RateLimitError) {
      const response = apiError(429, "RATE_LIMITED", "Too many reset requests. Try again later.");
      response.headers.set("retry-after", String(error.retryAfterSeconds));
      return response;
    }
    return routeError(error, { route: "POST /api/auth/forgot-password" });
  }
}

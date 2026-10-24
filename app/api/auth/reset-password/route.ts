import { readRequestJson } from "@/lib/request-body";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { PasswordResetError, resetPasswordWithToken } from "@/lib/password-reset";
import { consumeNamedLimit, RateLimitError, requestIp } from "@/lib/rate-limit";

const schema = z.object({ token: z.string().min(10).max(200), password: z.string().min(1).max(1024) });

export async function POST(request: NextRequest) {
  try {
    const requestBody = await readRequestJson(request);
    if (requestBody instanceof Response) return requestBody;
    const parsed = schema.safeParse(requestBody);
    if (!parsed.success) return validationError(parsed.error);
    await consumeNamedLimit("password-reset-submit", requestIp(request));
    const result = await resetPasswordWithToken(parsed.data.token, parsed.data.password);
    return NextResponse.json({ ok: true, username: result.username });
  } catch (error) {
    if (error instanceof PasswordResetError) return apiError(400, error.code, error.message);
    if (error instanceof RateLimitError) {
      const response = apiError(429, "RATE_LIMITED", "Too many attempts. Try again later.");
      response.headers.set("retry-after", String(error.retryAfterSeconds));
      return response;
    }
    return routeError(error, { route: "POST /api/auth/reset-password" });
  }
}

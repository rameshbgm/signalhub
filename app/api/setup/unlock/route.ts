import { NextResponse, type NextRequest } from "next/server";
import { trustedClientIp } from "@/lib/network-policy";
import { currentSetupMode, readJson, setupError } from "@/lib/setup/http";
import {
  consumeSetupAttempt,
  SETUP_COOKIE,
  SETUP_COOKIE_MAX_AGE_SECONDS,
  setupCookieValue,
  setupTokenMatches,
} from "@/lib/setup/token";

export async function POST(request: NextRequest) {
  if (!currentSetupMode()) return setupError(409, "SETUP_COMPLETE", "Setup is already complete.");
  if (!consumeSetupAttempt(trustedClientIp(request.headers) ?? "unknown")) {
    return setupError(429, "SETUP_RATE_LIMITED", "Too many attempts. Wait a minute and try again.");
  }
  const body = await readJson<{ token?: unknown }>(request);
  const token = process.env.SIGNALHUB_SETUP_TOKEN;
  if (typeof body?.token !== "string" || !setupTokenMatches(body.token, token)) {
    return setupError(401, "SETUP_TOKEN_INVALID", "That setup token is not correct. Copy it from the server logs.");
  }
  const response = NextResponse.json({ unlocked: true });
  response.cookies.set(SETUP_COOKIE, setupCookieValue(token!), {
    httpOnly: true,
    sameSite: "strict",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: SETUP_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}

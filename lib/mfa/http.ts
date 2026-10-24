import type { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { apiError, routeError } from "@/lib/api-response";
import { MfaError } from "@/lib/mfa/service";
import { RateLimitError } from "@/lib/rate-limit";
import { secureCookiesFor } from "@/lib/settings/request";

export const CHALLENGE_COOKIE = "sp_mfa_challenge";
export const TRUST_COOKIE = "sp_mfa_trust";

const base = { httpOnly: true, sameSite: "lax" as const, path: "/api/auth" };

export async function setChallengeCookie(response: NextResponse, token: string, maxAgeSeconds: number) {
  response.cookies.set(CHALLENGE_COOKIE, token, { ...base, secure: secureCookiesFor(await headers()), maxAge: maxAgeSeconds });
}

export function clearChallengeCookie(response: NextResponse) {
  response.cookies.set(CHALLENGE_COOKIE, "", { ...base, maxAge: 0 });
}

export async function setTrustCookie(response: NextResponse, token: string, expiresAt: Date) {
  response.cookies.set(TRUST_COOKIE, token, { ...base, secure: secureCookiesFor(await headers()), expires: expiresAt });
}

export const challengeToken = (request: NextRequest) => request.cookies.get(CHALLENGE_COOKIE)?.value;
export const trustToken = (request: NextRequest) => request.cookies.get(TRUST_COOKIE)?.value;

/** Turns the MFA service's expected failures and rate limits into API errors; anything else is a 500. */
export function mfaRouteError(error: unknown, route: string) {
  if (error instanceof MfaError) return apiError(error.status, error.code, error.message);
  if (error instanceof RateLimitError) {
    const response = apiError(429, "RATE_LIMITED", "Too many attempts. Try again later.");
    response.headers.set("retry-after", String(error.retryAfterSeconds));
    return response;
  }
  return routeError(error, { route });
}

import { NextRequest, NextResponse } from "next/server";
import {
  createOidcTransactionValues,
  getOidcDiscovery,
  OIDC_TRANSACTION_COOKIE,
  oidcConfigured,
  oidcRedirectUri,
  signOidcTransaction,
} from "@/lib/oidc";
import { apiError, routeError } from "@/lib/api-response";
import { consumeRateLimit, RateLimitError, requestIp } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  try {
    if (!oidcConfigured()) return apiError(404, "OIDC_DISABLED", "OIDC login is not configured");
    await consumeRateLimit("oidc-start", requestIp(request), { limit: 20, windowMs: 15 * 60_000 });

    const discovery = await getOidcDiscovery();
    const transaction = createOidcTransactionValues();
    const requestedReturnTo = request.nextUrl.searchParams.get("returnTo") ?? "/organization";
    const returnTo = requestedReturnTo.startsWith("/") && !requestedReturnTo.startsWith("//")
      ? requestedReturnTo
      : "/organization";
    const signedTransaction = await signOidcTransaction({ ...transaction, returnTo });
    const authorizationUrl = new URL(discovery.authorization_endpoint);
    authorizationUrl.search = new URLSearchParams({
      response_type: "code",
      client_id: process.env.OIDC_CLIENT_ID!,
      redirect_uri: oidcRedirectUri(request.nextUrl.origin),
      scope: "openid email profile",
      state: transaction.state,
      nonce: transaction.nonce,
      code_challenge: transaction.challenge,
      code_challenge_method: "S256",
    }).toString();

    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set(OIDC_TRANSACTION_COOKIE, signedTransaction, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/auth/oidc",
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    if (error instanceof RateLimitError) {
      const response = apiError(429, "RATE_LIMITED", "Too many OIDC login attempts");
      response.headers.set("retry-after", String(error.retryAfterSeconds));
      return response;
    }
    return routeError(error);
  }
}

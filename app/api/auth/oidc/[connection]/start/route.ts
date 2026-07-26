import { NextRequest, NextResponse } from "next/server";
import { apiError, routeError } from "@/lib/api-response";
import { findEnabledConnection, oidcConnectionConfig } from "@/lib/identity-connections";
import {
  createOidcTransactionValues,
  getOidcDiscovery,
  OIDC_TRANSACTION_COOKIE,
  oidcRedirectUri,
  signOidcTransaction,
} from "@/lib/oidc";
import { consumeRateLimit, RateLimitError, requestIp } from "@/lib/rate-limit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ connection: string }> }
) {
  try {
    const { connection: slug } = await params;
    const connection = await findEnabledConnection(slug, "OIDC");
    if (!connection || connection.audience !== "ORGANIZATION") return apiError(404, "IDENTITY_CONNECTION_NOT_FOUND", "Identity connection not found");
    await consumeRateLimit("enterprise-oidc-start", requestIp(request), {
      limit: 20,
      windowMs: 15 * 60_000,
    });
    const config = oidcConnectionConfig(connection);
    const discovery = await getOidcDiscovery(config);
    const transaction = createOidcTransactionValues();
    const requestedReturnTo = request.nextUrl.searchParams.get("returnTo") ?? "/organization";
    const returnTo = requestedReturnTo.startsWith("/") && !requestedReturnTo.startsWith("//")
      ? requestedReturnTo
      : "/organization";
    const signedTransaction = await signOidcTransaction({
      ...transaction,
      returnTo,
      connectionSlug: connection.slug,
    });
    const authorizationUrl = new URL(discovery.authorization_endpoint);
    authorizationUrl.search = new URLSearchParams({
      response_type: "code",
      client_id: config.clientId,
      redirect_uri: oidcRedirectUri(request.nextUrl.origin, connection.slug),
      scope: (config.scopes ?? ["openid", "email", "profile", "groups"]).join(" "),
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
      path: `/api/auth/oidc/${encodeURIComponent(connection.slug)}`,
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

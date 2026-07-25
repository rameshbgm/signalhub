import { NextRequest, NextResponse } from "next/server";
import { apiError, routeError } from "@/lib/api-response";
import { findEnabledConnection } from "@/lib/identity-connections";
import { createOidcTransactionValues, signOidcTransaction } from "@/lib/oidc";
import { consumeRateLimit, RateLimitError, requestIp } from "@/lib/rate-limit";
import { createSamlClient } from "@/lib/saml";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ connection: string }> }
) {
  try {
    const { connection: slug } = await params;
    const connection = await findEnabledConnection(slug, "SAML");
    if (!connection) return apiError(404, "IDENTITY_CONNECTION_NOT_FOUND", "Identity connection not found");
    await consumeRateLimit("saml-start", requestIp(request), { limit: 20, windowMs: 15 * 60_000 });
    const returnToParam = request.nextUrl.searchParams.get("returnTo");
    const returnTo =
      returnToParam?.startsWith("/") && !returnToParam.startsWith("//")
        ? returnToParam
        : connection.audience === "PLATFORM" ? "/platform" : "/admin";
    const transaction = createOidcTransactionValues();
    const relayState = await signOidcTransaction({
      ...transaction,
      returnTo,
      connectionSlug: connection.slug,
    });
    const redirectUrl = await createSamlClient(connection, request.nextUrl.origin)
      .getAuthorizeUrlAsync(relayState, undefined, {});
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    if (error instanceof RateLimitError) {
      const response = apiError(429, "RATE_LIMITED", "Too many SAML login attempts");
      response.headers.set("retry-after", String(error.retryAfterSeconds));
      return response;
    }
    return routeError(error);
  }
}

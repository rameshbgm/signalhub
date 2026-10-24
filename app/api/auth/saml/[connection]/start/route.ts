import { NextRequest, NextResponse } from "next/server";
import { apiError, routeError } from "@/lib/api-response";
import { findEnabledConnection } from "@/lib/identity-connections";
import { createSamlTransaction, SAML_TRANSACTION_COOKIE, SAML_TRANSACTION_SECONDS } from "@/lib/saml-transaction";
import { appBaseUrl } from "@/lib/settings/request";
import { consumeNamedLimit, RateLimitError, requestIp } from "@/lib/rate-limit";
import { createSamlClient } from "@/lib/saml";
import { safeReturnTo } from "@/lib/public-path";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ connection: string }> }
) {
  try {
    const { connection: slug } = await params;
    const connection = await findEnabledConnection(slug, "SAML");
    if (!connection || connection.audience !== "ORGANIZATION") return apiError(404, "IDENTITY_CONNECTION_NOT_FOUND", "Identity connection not found");
    await consumeNamedLimit("saml-start", requestIp(request));
    const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"), "/organization");
    // Cross-site SAML POST needs SameSite=None, which requires HTTPS.
    if (!appBaseUrl(request.nextUrl.origin).startsWith("https://")) {
      return apiError(400, "SAML_HTTPS_REQUIRED", "Configure an HTTPS public URL before using SAML sign-in.");
    }
    const transaction = await createSamlTransaction(connection.slug, returnTo);
    const redirectUrl = await createSamlClient(connection, request.nextUrl.origin, transaction.requestId)
      .getAuthorizeUrlAsync(transaction.relayState, undefined, {});
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set(SAML_TRANSACTION_COOKIE, transaction.nonce, {
      httpOnly: true, secure: true, sameSite: "none", path: "/", maxAge: SAML_TRANSACTION_SECONDS,
    });
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof RateLimitError) {
      const response = apiError(429, "RATE_LIMITED", "Too many SAML login attempts");
      response.headers.set("retry-after", String(error.retryAfterSeconds));
      return response;
    }
    return routeError(error);
  }
}

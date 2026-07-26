import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { collections } from "@/lib/db";
import {
  connectionMfaSatisfied,
  findEnabledConnection,
  oidcConnectionConfig,
  upsertExternalUser,
} from "@/lib/identity-connections";
import {
  exchangeAndVerifyOidcCode,
  OIDC_TRANSACTION_COOKIE,
  oidcRedirectUri,
  verifyOidcTransaction,
} from "@/lib/oidc";
import { organizationIsActive } from "@/lib/organization-state";
import { requestIp } from "@/lib/rate-limit";
import { writeActiveTenantAudit } from "@/lib/tenant-audit";

function loginError(request: NextRequest, code: string) {
  const url = new URL("/login", request.nextUrl.origin);
  url.searchParams.set("error", code);
  const response = NextResponse.redirect(url);
  response.cookies.delete(OIDC_TRANSACTION_COOKIE);
  return response;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ connection: string }> }) {
  const { connection: slug } = await params;
  const connection = await findEnabledConnection(slug, "OIDC");
  if (!connection || connection.audience !== "ORGANIZATION") return loginError(request, "oidc_connection_disabled");
  try {
    if (request.nextUrl.searchParams.get("error")) return loginError(request, "oidc_denied");
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const transactionCookie = request.cookies.get(OIDC_TRANSACTION_COOKIE)?.value;
    if (!code || !state || !transactionCookie) return loginError(request, "oidc_invalid_response");
    const transaction = await verifyOidcTransaction(transactionCookie);
    if (transaction.state !== state || transaction.connectionSlug !== connection.slug) {
      return loginError(request, "oidc_state_mismatch");
    }
    const identity = await exchangeAndVerifyOidcCode({
      code,
      verifier: transaction.verifier,
      nonce: transaction.nonce,
      redirectUri: oidcRedirectUri(request.nextUrl.origin, connection.slug),
      config: oidcConnectionConfig(connection),
    });
    if (!connectionMfaSatisfied(connection, identity)) return loginError(request, "oidc_mfa_required");
    const result = await upsertExternalUser({
      connection,
      subject: identity.subject,
      email: identity.email,
      name: identity.name,
      groups: identity.groups,
    });
    if (!result) return loginError(request, "oidc_no_membership");
    const organization = result.membership.role === "ADMIN"
      ? await collections.organizations().find({ suspended: { $ne: true }, status: "ACTIVE" }).sort({ createdAt: 1 }).limit(1).next()
      : await collections.organizations().findOne({ _id: result.membership.orgId });
    if (!organization || !organizationIsActive(organization)) return loginError(request, "oidc_no_active_organization");
    await writeActiveTenantAudit(organization._id, {
      actor: result.user.username,
      action: "LOGIN",
      target: "session",
      metadata: { method: "oidc", connectionId: connection._id.toHexString(), issuer: identity.issuer },
      createdAt: new Date(),
    });
    await createSession({
      userId: result.user._id.toHexString(),
      membershipId: result.membership._id.toHexString(),
      orgId: organization._id.toHexString(),
      username: result.user.username,
      email: result.user.email,
      name: result.user.name,
      role: result.membership.role,
    }, {
      authMethod: "OIDC",
      mfaVerified: true,
      ipAddress: requestIp(request),
      userAgent: request.headers.get("user-agent"),
    });
    const response = NextResponse.redirect(new URL(transaction.returnTo, request.nextUrl.origin));
    response.cookies.delete(OIDC_TRANSACTION_COOKIE);
    return response;
  } catch (error) {
    console.error("Enterprise OIDC callback failed", error);
    return loginError(request, "oidc_failed");
  }
}

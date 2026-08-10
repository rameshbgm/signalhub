import { NextRequest, NextResponse } from "next/server";
import { errorFields, logger } from "@/lib/logger";
import { createSession } from "@/lib/auth";
import { database } from "@/lib/postgres/client";
import {
  exchangeAndVerifyOidcCode,
  OIDC_TRANSACTION_COOKIE,
  oidcConfigured,
  oidcRedirectUri,
  verifyOidcTransaction,
} from "@/lib/oidc";
import { writeActiveTenantAudit } from "@/lib/tenant-audit";

function loginError(request: NextRequest, code: string) {
  const url = new URL("/login", request.nextUrl.origin);
  url.searchParams.set("error", code);
  const response = NextResponse.redirect(url);
  response.cookies.delete(OIDC_TRANSACTION_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  if (!oidcConfigured()) return loginError(request, "oidc_disabled");
  try {
    const error = request.nextUrl.searchParams.get("error");
    if (error) return loginError(request, "oidc_denied");
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const transactionCookie = request.cookies.get(OIDC_TRANSACTION_COOKIE)?.value;
    if (!code || !state || !transactionCookie) return loginError(request, "oidc_invalid_response");

    const transaction = await verifyOidcTransaction(transactionCookie);
    if (transaction.state !== state) return loginError(request, "oidc_state_mismatch");
    const identity = await exchangeAndVerifyOidcCode({
      code,
      verifier: transaction.verifier,
      nonce: transaction.nonce,
      redirectUri: oidcRedirectUri(request.nextUrl.origin),
    });

    const user = await database.selectFrom("users").selectAll()
      .where("oidcIssuer", "=", identity.issuer)
      .where("oidcSubject", "=", identity.subject)
      .executeTakeFirst();
    if (!user || user.disabled) return loginError(request, "oidc_account_disabled");

    const membership = await database.selectFrom("memberships as membership")
      .innerJoin("organizations as organization", "organization.id", "membership.orgId")
      .selectAll("membership")
      .where("membership.userId", "=", user.id)
      .where("membership.status", "=", "ACTIVE")
      .where("organization.suspended", "=", false)
      .where("organization.status", "=", "ACTIVE")
      .orderBy("membership.createdAt")
      .executeTakeFirst();
    if (!membership) return loginError(request, "oidc_no_active_organization");

    const authorized = await writeActiveTenantAudit(
      membership.orgId,
      {
        actor: user.email,
        action: "LOGIN",
        target: "session",
        metadata: { method: "oidc", issuer: identity.issuer },
        createdAt: new Date(),
      },
      async (databaseSession) => {
        const currentUser = await databaseSession.selectFrom("users").selectAll()
          .where("id", "=", user.id).where("disabled", "=", false)
          .where("oidcIssuer", "=", identity.issuer)
          .where("oidcSubject", "=", identity.subject)
          .executeTakeFirst();
        const currentMembership = await databaseSession.selectFrom("memberships").selectAll()
          .where("id", "=", membership.id).where("userId", "=", user.id)
          .where("orgId", "=", membership.orgId).where("status", "=", "ACTIVE")
          .executeTakeFirst();
        if (!currentUser || !currentMembership) {
          throw new Error("OIDC authorization changed during login");
        }
        return { user: currentUser, membership: currentMembership };
      }
    );
    await createSession({
      userId: authorized.user.id,
      membershipId: authorized.membership.id,
      orgId: authorized.membership.orgId,
      username: authorized.user.username,
      email: authorized.user.email,
      name: authorized.user.name,
      role: authorized.membership.role,
    }, {
      authMethod: "OIDC",
      mfaVerified: true,
      ipAddress: request.headers.get("x-real-ip"),
      userAgent: request.headers.get("user-agent"),
    });
    const response = NextResponse.redirect(new URL(transaction.returnTo, request.nextUrl.origin));
    response.cookies.delete(OIDC_TRANSACTION_COOKIE);
    return response;
  } catch (error) {
    logger.error({ ...errorFields(error) }, "OIDC callback failed");
    return loginError(request, "oidc_failed");
  }
}

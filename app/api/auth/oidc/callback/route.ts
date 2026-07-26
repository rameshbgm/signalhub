import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { collections } from "@/lib/db";
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

    const user = await collections.users().findOne({
      oidcIssuer: identity.issuer,
      oidcSubject: identity.subject,
    });
    if (!user || user.disabled) return loginError(request, "oidc_account_disabled");

    const memberships = await collections
      .memberships()
      .find({ userId: user._id, status: "ACTIVE" })
      .sort({ createdAt: 1 })
      .toArray();
    if (!memberships.length) return loginError(request, "oidc_no_membership");

    const activeOrganizations = await collections
      .organizations()
      .find({
        _id: { $in: memberships.map((membership) => membership.orgId) },
        suspended: { $ne: true },
        status: { $nin: ["PROVISIONING", "SUSPENDED", "DELETING"] },
      })
      .toArray();
    const activeIds = new Set(activeOrganizations.map((organization) => organization._id.toHexString()));
    const membership = memberships.find((item) => activeIds.has(item.orgId.toHexString()));
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
        const currentUser = await collections.users().findOne(
          {
            _id: user!._id,
            disabled: { $ne: true },
            oidcIssuer: identity.issuer,
            oidcSubject: identity.subject,
          },
          { session: databaseSession }
        );
        const currentMembership = await collections.memberships().findOne(
          {
            _id: membership._id,
            userId: user!._id,
            orgId: membership.orgId,
            status: "ACTIVE",
          },
          { session: databaseSession }
        );
        if (!currentUser || !currentMembership) {
          throw new Error("OIDC authorization changed during login");
        }
        return { user: currentUser, membership: currentMembership };
      }
    );
    await createSession({
      userId: authorized.user._id.toHexString(),
      membershipId: authorized.membership._id.toHexString(),
      orgId: authorized.membership.orgId.toHexString(),
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
    console.error("OIDC callback failed", error);
    return loginError(request, "oidc_failed");
  }
}

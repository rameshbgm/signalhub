import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { createPlatformSession, createSession } from "@/lib/auth";
import { collections } from "@/lib/db";
import {
  connectionMfaSatisfied,
  findEnabledConnection,
  oidcConnectionConfig,
  upsertExternalUser,
} from "@/lib/identity-connections";
import { canonicalizeEmail } from "@/lib/identity";
import {
  exchangeAndVerifyOidcCode,
  OIDC_TRANSACTION_COOKIE,
  oidcRedirectUri,
  verifyOidcTransaction,
} from "@/lib/oidc";
import { organizationIsActive } from "@/lib/organization-state";
import {
  normalizedPlatformRole,
  platformAdminIsActive,
  writePlatformAudit,
} from "@/lib/platform-policy";
import { requestIp } from "@/lib/rate-limit";
import { writeActiveTenantAudit } from "@/lib/tenant-audit";

function loginError(request: NextRequest, audience: "ORGANIZATION" | "PLATFORM", code: string) {
  const url = new URL(audience === "PLATFORM" ? "/platform/login" : "/admin/login", request.nextUrl.origin);
  url.searchParams.set("error", code);
  const response = NextResponse.redirect(url);
  response.cookies.delete(OIDC_TRANSACTION_COOKIE);
  return response;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ connection: string }> }
) {
  const { connection: slug } = await params;
  const connection = await findEnabledConnection(slug, "OIDC");
  if (!connection) return loginError(request, "ORGANIZATION", "oidc_connection_disabled");
  try {
    if (request.nextUrl.searchParams.get("error")) {
      return loginError(request, connection.audience, "oidc_denied");
    }
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const transactionCookie = request.cookies.get(OIDC_TRANSACTION_COOKIE)?.value;
    if (!code || !state || !transactionCookie) {
      return loginError(request, connection.audience, "oidc_invalid_response");
    }
    const transaction = await verifyOidcTransaction(transactionCookie);
    if (transaction.state !== state || transaction.connectionSlug !== connection.slug) {
      return loginError(request, connection.audience, "oidc_state_mismatch");
    }
    const identity = await exchangeAndVerifyOidcCode({
      code,
      verifier: transaction.verifier,
      nonce: transaction.nonce,
      redirectUri: oidcRedirectUri(request.nextUrl.origin, connection.slug),
      config: oidcConnectionConfig(connection),
    });
    if (!connectionMfaSatisfied(connection, identity)) {
      return loginError(request, connection.audience, "oidc_mfa_required");
    }

    if (connection.audience === "PLATFORM") {
      const canonicalEmail = canonicalizeEmail(identity.email);
      const existingIdentity = await collections.externalIdentities().findOne({
        connectionId: connection._id,
        subject: identity.subject,
      });
      const admin = existingIdentity?.platformAdminId
        ? await collections.platformAdmins().findOne({ _id: existingIdentity.platformAdminId })
        : await collections.platformAdmins().findOne({ canonicalEmail });
      if (!admin || !platformAdminIsActive(admin) || !admin.totpSecretCiphertext) {
        return loginError(request, connection.audience, "oidc_platform_account_required");
      }
      const now = new Date();
      await collections.externalIdentities().updateOne(
        { connectionId: connection._id, subject: identity.subject },
        {
          $set: {
            userId: null,
            platformAdminId: admin._id,
            canonicalEmail,
            groups: identity.groups,
            lastLoginAt: now,
            updatedAt: now,
          },
          $setOnInsert: { _id: new ObjectId(), createdAt: now },
          $inc: { version: 1 },
        },
        { upsert: true }
      );
      const role = normalizedPlatformRole(admin);
      await createPlatformSession(
        {
          platformAdminId: admin._id.toHexString(),
          email: admin.email,
          name: admin.name,
          role,
          sessionVersion: admin.sessionVersion ?? 1,
          mfaVerified: true,
        },
        {
          authMethod: "OIDC",
          ipAddress: requestIp(request),
          userAgent: request.headers.get("user-agent"),
        }
      );
      await writePlatformAudit({
        actorId: admin._id,
        actorEmail: admin.email,
        actorRole: role,
        action: "PLATFORM_LOGIN_SUCCEEDED",
        targetType: "platformAdmin",
        targetId: admin._id.toHexString(),
        metadata: { method: "oidc", connectionId: connection._id.toHexString() },
      });
    } else {
      const result = await upsertExternalUser({
        connection,
        subject: identity.subject,
        email: identity.email,
        name: identity.name,
        groups: identity.groups,
      });
      if (!result) return loginError(request, connection.audience, "oidc_no_membership");
      const organization = await collections.organizations().findOne({
        _id: result.membership.orgId,
      });
      if (!organization || !organizationIsActive(organization)) {
        return loginError(request, connection.audience, "oidc_no_active_organization");
      }
      await writeActiveTenantAudit(result.membership.orgId, {
        actor: result.user.email,
        action: "LOGIN",
        target: "session",
        metadata: {
          method: "oidc",
          connectionId: connection._id.toHexString(),
          issuer: identity.issuer,
        },
        createdAt: new Date(),
      });
      await createSession(
        {
          userId: result.user._id.toHexString(),
          membershipId: result.membership._id.toHexString(),
          orgId: result.membership.orgId.toHexString(),
          email: result.user.email,
          name: result.user.name,
          role: result.membership.role,
        },
        {
          authMethod: "OIDC",
          mfaVerified: true,
          ipAddress: requestIp(request),
          userAgent: request.headers.get("user-agent"),
        }
      );
    }
    const response = NextResponse.redirect(new URL(transaction.returnTo, request.nextUrl.origin));
    response.cookies.delete(OIDC_TRANSACTION_COOKIE);
    return response;
  } catch (error) {
    console.error("Enterprise OIDC callback failed", error);
    return loginError(request, connection.audience, "oidc_failed");
  }
}

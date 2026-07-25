import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { createPlatformSession, createSession } from "@/lib/auth";
import { collections } from "@/lib/db";
import {
  connectionMfaSatisfied,
  findEnabledConnection,
  upsertExternalUser,
} from "@/lib/identity-connections";
import { canonicalizeEmail } from "@/lib/identity";
import { verifyOidcTransaction } from "@/lib/oidc";
import { organizationIsActive } from "@/lib/organization-state";
import { normalizedPlatformRole, platformAdminIsActive, writePlatformAudit } from "@/lib/platform-policy";
import { requestIp } from "@/lib/rate-limit";
import { createSamlClient, samlProfileIdentity } from "@/lib/saml";
import { writeActiveTenantAudit } from "@/lib/tenant-audit";

function loginError(request: NextRequest, audience: "ORGANIZATION" | "PLATFORM", code: string) {
  const url = new URL(audience === "PLATFORM" ? "/platform/login" : "/admin/login", request.nextUrl.origin);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url, 303);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ connection: string }> }
) {
  const { connection: slug } = await params;
  const connection = await findEnabledConnection(slug, "SAML");
  if (!connection) return loginError(request, "ORGANIZATION", "saml_connection_disabled");
  try {
    const form = await request.formData();
    const samlResponse = form.get("SAMLResponse");
    const relayState = form.get("RelayState");
    if (typeof samlResponse !== "string" || typeof relayState !== "string") {
      return loginError(request, connection.audience, "saml_invalid_response");
    }
    const transaction = await verifyOidcTransaction(relayState);
    if (transaction.connectionSlug !== connection.slug) {
      return loginError(request, connection.audience, "saml_state_mismatch");
    }
    const validated = await createSamlClient(connection, request.nextUrl.origin)
      .validatePostResponseAsync({ SAMLResponse: samlResponse });
    if (!validated.profile || validated.loggedOut) {
      return loginError(request, connection.audience, "saml_invalid_assertion");
    }
    const identity = samlProfileIdentity(validated.profile as unknown as Record<string, unknown>);
    if (!connectionMfaSatisfied(connection, identity)) {
      return loginError(request, connection.audience, "saml_mfa_required");
    }

    if (connection.audience === "PLATFORM") {
      const canonicalEmail = canonicalizeEmail(identity.email);
      const externalIdentity = await collections.externalIdentities().findOne({
        connectionId: connection._id,
        subject: identity.subject,
      });
      const admin = externalIdentity?.platformAdminId
        ? await collections.platformAdmins().findOne({ _id: externalIdentity.platformAdminId })
        : await collections.platformAdmins().findOne({ canonicalEmail });
      if (!admin || !platformAdminIsActive(admin) || !admin.totpSecretCiphertext) {
        return loginError(request, connection.audience, "saml_platform_account_required");
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
          authMethod: "SAML",
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
        metadata: { method: "saml", connectionId: connection._id.toHexString() },
      });
    } else {
      const result = await upsertExternalUser({ connection, ...identity });
      if (!result) return loginError(request, connection.audience, "saml_no_membership");
      const organization = await collections.organizations().findOne({ _id: result.membership.orgId });
      if (!organization || !organizationIsActive(organization)) {
        return loginError(request, connection.audience, "saml_no_active_organization");
      }
      await writeActiveTenantAudit(result.membership.orgId, {
        actor: result.user.email,
        action: "LOGIN",
        target: "session",
        metadata: { method: "saml", connectionId: connection._id.toHexString() },
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
          authMethod: "SAML",
          mfaVerified: true,
          ipAddress: requestIp(request),
          userAgent: request.headers.get("user-agent"),
        }
      );
    }
    return NextResponse.redirect(new URL(transaction.returnTo, request.nextUrl.origin), 303);
  } catch (error) {
    console.error("SAML ACS failed", error);
    return loginError(request, connection.audience, "saml_failed");
  }
}

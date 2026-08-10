import { NextRequest, NextResponse } from "next/server";
import { errorFields, logger } from "@/lib/logger";
import { createSession } from "@/lib/auth";
import { database } from "@/lib/postgres/client";
import { connectionMfaSatisfied, findEnabledConnection, upsertExternalUser } from "@/lib/identity-connections";
import { verifyOidcTransaction } from "@/lib/oidc";
import { organizationIsActive } from "@/lib/organization-state";
import { requestIp } from "@/lib/rate-limit";
import { createSamlClient, samlProfileIdentity } from "@/lib/saml";
import { writeActiveTenantAudit } from "@/lib/tenant-audit";

function loginError(request: NextRequest, code: string) {
  const url = new URL("/login", request.nextUrl.origin);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ connection: string }> }) {
  const { connection: slug } = await params;
  const connection = await findEnabledConnection(slug, "SAML");
  if (!connection || connection.audience !== "ORGANIZATION") return loginError(request, "saml_connection_disabled");
  try {
    const form = await request.formData();
    const samlResponse = form.get("SAMLResponse");
    const relayState = form.get("RelayState");
    if (typeof samlResponse !== "string" || typeof relayState !== "string") return loginError(request, "saml_invalid_response");
    const transaction = await verifyOidcTransaction(relayState);
    if (transaction.connectionSlug !== connection.slug) return loginError(request, "saml_state_mismatch");
    const validated = await createSamlClient(connection, request.nextUrl.origin).validatePostResponseAsync({ SAMLResponse: samlResponse });
    if (!validated.profile || validated.loggedOut) return loginError(request, "saml_invalid_assertion");
    const identity = samlProfileIdentity(validated.profile as unknown as Record<string, unknown>);
    if (!connectionMfaSatisfied(connection, identity)) return loginError(request, "saml_mfa_required");
    const result = await upsertExternalUser({ connection, ...identity });
    if (!result) return loginError(request, "saml_no_membership");
    const organization = result.membership.role === "ADMIN"
      ? await database.selectFrom("organizations").selectAll().where("suspended", "=", false)
        .where("status", "=", "ACTIVE").orderBy("createdAt", "asc").executeTakeFirst()
      : await database.selectFrom("organizations").selectAll().where("id", "=", result.membership.orgId).executeTakeFirst();
    if (!organization || !organizationIsActive(organization)) return loginError(request, "saml_no_active_organization");
    await writeActiveTenantAudit(organization.id, {
      actor: result.user.username,
      action: "LOGIN",
      target: "session",
      metadata: { method: "saml", connectionId: connection.id },
      createdAt: new Date(),
    });
    await createSession({
      userId: result.user.id,
      membershipId: result.membership.id,
      orgId: organization.id,
      username: result.user.username,
      email: result.user.email,
      name: result.user.name,
      role: result.membership.role,
    }, {
      authMethod: "SAML",
      mfaVerified: true,
      ipAddress: requestIp(request),
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.redirect(new URL(transaction.returnTo, request.nextUrl.origin), 303);
  } catch (error) {
    logger.error({ ...errorFields(error), connection: slug }, "SAML assertion callback failed");
    return loginError(request, "saml_failed");
  }
}

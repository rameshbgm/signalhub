import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import type { IdentityConnectionRow, MembershipRole } from "@/lib/postgres/schema";
import { decryptSecret } from "@/lib/encryption";
import { canonicalizeEmail } from "@/lib/identity";
import type { OidcConnectionConfig } from "@/lib/oidc";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";

type SamlConnectionConfig = {
  entryPoint: string;
  issuer: string;
  idpCertificate: string;
  privateKey?: string;
  spCertificate?: string;
  decryptionPrivateKey?: string;
  signatureAlgorithm?: "sha256" | "sha512";
  identifierFormat?: string | null;
};

export async function findEnabledConnection(slug: string, type?: "OIDC" | "SAML") {
  let query = database.selectFrom("identityConnections").selectAll()
    .where("slug", "=", slug).where("enabled", "=", true);
  if (type) query = query.where("type", "=", type);
  return query.executeTakeFirst();
}

export function oidcConnectionConfig(connection: IdentityConnectionRow) {
  if (connection.type !== "OIDC") throw new Error("Identity connection is not OIDC");
  const value = JSON.parse(decryptSecret(connection.configCiphertext)) as OidcConnectionConfig;
  if (!value.issuer || !value.clientId || !value.clientSecret) throw new Error("OIDC connection configuration is incomplete");
  return value;
}

export function samlConnectionConfig(connection: IdentityConnectionRow) {
  if (connection.type !== "SAML") throw new Error("Identity connection is not SAML");
  const value = JSON.parse(decryptSecret(connection.configCiphertext)) as SamlConnectionConfig;
  if (!value.entryPoint || !value.issuer || !value.idpCertificate) throw new Error("SAML connection configuration is incomplete");
  return value;
}

export function connectionMfaSatisfied(connection: IdentityConnectionRow, claims: { acr?: string | null; amr?: string[] }) {
  if (!connection.acceptedAcrValues.length && !connection.acceptedAmrValues.length) return true;
  return (Boolean(claims.acr) && connection.acceptedAcrValues.includes(claims.acr!)) ||
    (claims.amr ?? []).some((method) => connection.acceptedAmrValues.includes(method));
}

export function mappedTenantAccess(connection: IdentityConnectionRow, groups: string[]) {
  const normalizedGroups = new Set(groups.map((group) => group.trim().toLowerCase()));
  const mappings = connection.roleMappings.filter((mapping) => normalizedGroups.has(mapping.group.trim().toLowerCase()));
  const roleOrder: MembershipRole[] = ["VIEWER", "RESPONDER", "INCIDENT_MANAGER", "ADMIN"];
  const mappedRoles = mappings.map((mapping) => mapping.role);
  const defaultRole = connection.defaultRole && roleOrder.includes(connection.defaultRole) ? connection.defaultRole : null;
  const role = [...mappedRoles, ...(defaultRole ? [defaultRole] : [])]
    .sort((left, right) => roleOrder.indexOf(right) - roleOrder.indexOf(left))[0];
  if (!role) return null;
  const unscoped = mappings.some((mapping) => mapping.role === role && !mapping.pageIds?.length);
  const pageIds = unscoped ? null : [...new Set(mappings.filter((mapping) => mapping.role === role).flatMap((mapping) => mapping.pageIds ?? []))];
  return { role, pageIds };
}

export async function upsertExternalUser(input: {
  connection: IdentityConnectionRow;
  subject: string;
  email: string;
  name: string;
  groups: string[];
}) {
  if (input.connection.audience !== "ORGANIZATION" || !input.connection.orgId) {
    throw new Error("Connection is not assigned to an organization");
  }
  const organizationId = input.connection.orgId;
  const canonicalEmail = canonicalizeEmail(input.email);
  const mapped = mappedTenantAccess(input.connection, input.groups);
  return withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(organizationId, transaction);
    const identity = await transaction.selectFrom("externalIdentities").selectAll()
      .where("connectionId", "=", input.connection.id).where("subject", "=", input.subject)
      .forUpdate().executeTakeFirst();
    let user = identity?.userId
      ? await transaction.selectFrom("users").selectAll().where("id", "=", identity.userId).executeTakeFirst()
      : undefined;
    if (!user && !input.connection.allowJitProvisioning) return null;
    const now = new Date();
    if (!user) {
      user = await transaction.insertInto("users").values({
        username: `sso-${crypto.randomUUID()}`,
        canonicalUsername: `sso-${crypto.randomUUID()}`,
        email: input.email,
        canonicalEmail,
        passwordHash: null,
        name: input.name,
        twoFactorEnabled: false,
        disabled: false,
        mustChangePassword: false,
        mustCompleteProfile: false,
        sessionVersion: 1,
        mfaRequired: false,
        totpSecretCiphertext: null,
        pendingTotpSecretCiphertext: null,
        recoveryCodeHashes: [],
        mfaEnrolledAt: null,
        createdAt: now,
        updatedAt: now,
      }).returningAll().executeTakeFirstOrThrow();
      const ssoUsername = `sso-${user.id}`;
      user = await transaction.updateTable("users").set({ username: ssoUsername, canonicalUsername: ssoUsername })
        .where("id", "=", user.id).returningAll().executeTakeFirstOrThrow();
    }
    if (user.disabled) return null;

    await transaction.insertInto("externalIdentities").values({
      connectionId: input.connection.id,
      userId: user.id,
      subject: input.subject,
      canonicalEmail,
      groups: input.groups,
      version: 1,
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    }).onConflict((conflict) => conflict.columns(["connectionId", "subject"]).doUpdateSet((expression) => ({
      userId: user!.id,
      canonicalEmail,
      groups: input.groups,
      lastLoginAt: now,
      updatedAt: now,
      version: expression("externalIdentities.version", "+", 1),
    }))).execute();

    let membership = await transaction.selectFrom("memberships").selectAll()
      .where("orgId", "=", organizationId).where("userId", "=", user.id).forUpdate().executeTakeFirst();
    if (!membership && (!input.connection.allowJitProvisioning || !mapped)) return null;
    if (!membership && mapped) {
      membership = await transaction.insertInto("memberships").values({
        orgId: organizationId, userId: user.id, role: mapped.role, status: "ACTIVE",
        pageIds: mapped.pageIds, invitationExpiresAt: null, invitationTokenHash: null,
        activatedAt: now, createdAt: now,
      }).returningAll().executeTakeFirstOrThrow();
    } else if (membership && mapped) {
      membership = await transaction.updateTable("memberships").set({
        role: mapped.role, pageIds: mapped.pageIds, status: "ACTIVE", activatedAt: membership.activatedAt ?? now,
      }).where("id", "=", membership.id).returningAll().executeTakeFirstOrThrow();
    }
    return membership ? { user, membership } : null;
  });
}

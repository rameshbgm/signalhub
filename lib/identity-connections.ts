import { ObjectId } from "mongodb";
import { collections, type IdentityConnectionDoc, type MembershipRole } from "@/lib/db";
import { decryptSecret } from "@/lib/encryption";
import { canonicalizeEmail } from "@/lib/identity";
import type { OidcConnectionConfig } from "@/lib/oidc";

export type SamlConnectionConfig = {
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
  return collections.identityConnections().findOne({
    slug,
    enabled: true,
    ...(type ? { type } : {}),
  });
}

export function oidcConnectionConfig(connection: IdentityConnectionDoc) {
  if (connection.type !== "OIDC") throw new Error("Identity connection is not OIDC");
  const value = JSON.parse(decryptSecret(connection.configCiphertext)) as OidcConnectionConfig;
  if (!value.issuer || !value.clientId || !value.clientSecret) {
    throw new Error("OIDC connection configuration is incomplete");
  }
  return value;
}

export function samlConnectionConfig(connection: IdentityConnectionDoc) {
  if (connection.type !== "SAML") throw new Error("Identity connection is not SAML");
  const value = JSON.parse(decryptSecret(connection.configCiphertext)) as SamlConnectionConfig;
  if (!value.entryPoint || !value.issuer || !value.idpCertificate) {
    throw new Error("SAML connection configuration is incomplete");
  }
  return value;
}

export function connectionMfaSatisfied(
  connection: IdentityConnectionDoc,
  claims: { acr?: string | null; amr?: string[] }
) {
  const acceptedAcr = connection.acceptedAcrValues ?? [];
  const acceptedAmr = connection.acceptedAmrValues ?? [];
  if (!acceptedAcr.length && !acceptedAmr.length) return true;
  return (
    (Boolean(claims.acr) && acceptedAcr.includes(claims.acr!)) ||
    (claims.amr ?? []).some((method) => acceptedAmr.includes(method))
  );
}

export function mappedTenantAccess(connection: IdentityConnectionDoc, groups: string[]) {
  const normalizedGroups = new Set(groups.map((group) => group.trim().toLowerCase()));
  const mappings = connection.roleMappings.filter(
    (mapping) =>
      ["OWNER", "ADMIN", "INCIDENT_MANAGER", "RESPONDER", "VIEWER"].includes(mapping.role) &&
      normalizedGroups.has(mapping.group.trim().toLowerCase())
  );
  const roleOrder: MembershipRole[] = [
    "VIEWER",
    "RESPONDER",
    "INCIDENT_MANAGER",
    "ADMIN",
    "OWNER",
  ];
  const mappedRoles = mappings.map((mapping) => mapping.role as MembershipRole);
  const defaultRole =
    connection.defaultRole &&
    roleOrder.includes(connection.defaultRole as MembershipRole)
      ? (connection.defaultRole as MembershipRole)
      : null;
  const role = [...mappedRoles, ...(defaultRole ? [defaultRole] : [])].sort(
    (left, right) => roleOrder.indexOf(right) - roleOrder.indexOf(left)
  )[0];
  if (!role) return null;
  const unscoped = mappings.some((mapping) => mapping.role === role && !mapping.pageIds?.length);
  const pageIds = unscoped
    ? null
    : mappings
        .filter((mapping) => mapping.role === role)
        .flatMap((mapping) => mapping.pageIds ?? []);
  return { role, pageIds };
}

export async function upsertExternalUser(input: {
  connection: IdentityConnectionDoc;
  subject: string;
  email: string;
  name: string;
  groups: string[];
}) {
  if (input.connection.audience !== "ORGANIZATION" || !input.connection.orgId) {
    throw new Error("Connection is not assigned to an organization");
  }
  const canonicalEmail = canonicalizeEmail(input.email);
  const existingIdentity = await collections.externalIdentities().findOne({
    connectionId: input.connection._id,
    subject: input.subject,
  });
  let user = existingIdentity?.userId
    ? await collections.users().findOne({ _id: existingIdentity.userId })
    : await collections.users().findOne({ canonicalEmail });
  if (!user && !input.connection.allowJitProvisioning) return null;
  const now = new Date();
  if (!user) {
    const userId = new ObjectId();
    await collections.users().insertOne({
      _id: userId,
      email: input.email,
      canonicalEmail,
      passwordHash: null,
      name: input.name,
      twoFactorEnabled: false,
      disabled: false,
      mustChangePassword: false,
      sessionVersion: 1,
      mfaRequired: false,
      totpSecretCiphertext: null,
      pendingTotpSecretCiphertext: null,
      recoveryCodeHashes: [],
      mfaEnrolledAt: null,
      createdAt: now,
      updatedAt: now,
    });
    user = await collections.users().findOne({ _id: userId });
  }
  if (!user || user.disabled) return null;

  await collections.externalIdentities().updateOne(
    { connectionId: input.connection._id, subject: input.subject },
    {
      $set: {
        userId: user._id,
        platformAdminId: null,
        canonicalEmail,
        groups: input.groups,
        lastLoginAt: now,
        updatedAt: now,
      },
      $setOnInsert: { _id: new ObjectId(), createdAt: now },
      $inc: { version: 1 },
    },
    { upsert: true }
  );

  let membership = await collections.memberships().findOne({
    orgId: input.connection.orgId,
    userId: user._id,
  });
  const mapped = mappedTenantAccess(input.connection, input.groups);
  if (!membership && (!input.connection.allowJitProvisioning || !mapped)) return null;
  if (!membership && mapped) {
    await collections.memberships().insertOne({
      _id: new ObjectId(),
      orgId: input.connection.orgId,
      userId: user._id,
      role: mapped.role,
      status: "ACTIVE",
      pageIds: mapped.pageIds,
      invitationExpiresAt: null,
      invitationTokenHash: null,
      activatedAt: now,
      createdAt: now,
    });
    membership = await collections.memberships().findOne({
      orgId: input.connection.orgId,
      userId: user._id,
    });
  } else if (membership && mapped) {
    await collections.memberships().updateOne(
      { _id: membership._id },
      {
        $set: {
          role: mapped.role,
          pageIds: mapped.pageIds,
          status: "ACTIVE",
          activatedAt: membership.activatedAt ?? now,
        },
      }
    );
    membership = await collections.memberships().findOne({ _id: membership._id });
  }
  return membership ? { user, membership } : null;
}

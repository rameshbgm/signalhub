import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { collections, type IdentityConnectionDoc } from "@/lib/db";
import { canonicalizeEmail, canonicalizeUsername, usernameError } from "@/lib/identity";
import { mappedTenantAccess } from "@/lib/identity-connections";
import { hashSecret } from "@/lib/secrets";

export const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
export const SCIM_GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";

export function scimGroupResource(group: {
  _id: ObjectId;
  externalId: string | null;
  displayName: string;
  memberExternalIds: string[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    schemas: [SCIM_GROUP_SCHEMA],
    id: group._id.toHexString(),
    externalId: group.externalId ?? undefined,
    displayName: group.displayName,
    members: group.memberExternalIds.map((value) => ({ value })),
    meta: {
      resourceType: "Group",
      created: group.createdAt.toISOString(),
      lastModified: group.updatedAt.toISOString(),
      version: `W/"${group.version}"`,
    },
  };
}

export function scimError(status: number, detail: string, scimType?: string) {
  return NextResponse.json(
    {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: String(status),
      detail,
      ...(scimType ? { scimType } : {}),
    },
    { status }
  );
}

export async function authenticateScim(request: NextRequest, connectionSlug: string) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return null;
  const now = new Date();
  const scimToken = await collections.scimTokens().findOne({
    tokenHash: hashSecret(token),
    revokedAt: null,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  });
  if (!scimToken) return null;
  const connection = await collections.identityConnections().findOne({
    _id: scimToken.connectionId,
    slug: connectionSlug,
    audience: "ORGANIZATION",
    enabled: true,
    orgId: { $ne: null },
  });
  if (!connection) return null;
  await collections.scimTokens().updateOne(
    { _id: scimToken._id },
    { $set: { lastUsedAt: now } }
  );
  return connection;
}

export function parseScimPagination(request: NextRequest) {
  const startIndex = Math.max(1, Number(request.nextUrl.searchParams.get("startIndex") ?? 1));
  const count = Math.max(1, Math.min(200, Number(request.nextUrl.searchParams.get("count") ?? 100)));
  return { startIndex, count, skip: startIndex - 1 };
}

export function scimList(resources: unknown[], totalResults: number, startIndex: number) {
  return {
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults,
    startIndex,
    itemsPerPage: resources.length,
    Resources: resources,
  };
}

export function scimUserResource(input: {
  id: string;
  externalId?: string | null;
  username: string;
  email: string;
  name: string;
  active: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    schemas: [SCIM_USER_SCHEMA],
    id: input.id,
    externalId: input.externalId ?? undefined,
    userName: input.username,
    active: input.active,
    displayName: input.name,
    name: { formatted: input.name },
    emails: [{ value: input.email, primary: true, type: "work" }],
    meta: {
      resourceType: "User",
      created: input.createdAt.toISOString(),
      lastModified: input.updatedAt.toISOString(),
      version: `W/"${input.version}"`,
    },
  };
}

export async function provisionScimUser(input: {
  connection: IdentityConnectionDoc;
  externalId?: string | null;
  userName: string;
  email: string;
  displayName?: string | null;
  active?: boolean;
}) {
  if (!input.connection.orgId) throw new Error("SCIM connection has no organization");
  const canonicalUsername = canonicalizeUsername(input.userName);
  const invalidUsername = usernameError(canonicalUsername);
  if (invalidUsername) throw new Error(invalidUsername);
  const canonicalEmail = canonicalizeEmail(input.email);
  if (!canonicalEmail.includes("@")) throw new Error("A primary communication email is required");
  const now = new Date();
  let user = await collections.users().findOne({ canonicalUsername });
  if (!user) {
    const userId = new ObjectId();
    await collections.users().insertOne({
      _id: userId,
      username: canonicalUsername,
      canonicalUsername,
      email: input.email.trim(),
      canonicalEmail,
      passwordHash: null,
      name: input.displayName?.trim() || canonicalUsername,
      twoFactorEnabled: false,
      disabled: input.active === false,
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
  if (!user) throw new Error("Unable to provision user");
  await collections.users().updateOne(
    { _id: user._id },
    { $set: {
      email: input.email.trim(),
      canonicalEmail,
      ...(input.displayName?.trim() ? { name: input.displayName.trim() } : {}),
      ...(input.active === true ? { disabled: false } : {}),
      updatedAt: now,
    } }
  );
  user = await collections.users().findOne({ _id: user._id });
  if (!user) throw new Error("Unable to update provisioned user");
  const subject = input.externalId?.trim() || canonicalUsername;
  const identity = await collections.externalIdentities().findOneAndUpdate(
    { connectionId: input.connection._id, subject },
    {
      $set: {
        userId: user._id,
        platformAdminId: null,
        canonicalEmail,
        updatedAt: now,
      },
      $setOnInsert: {
        _id: new ObjectId(),
        groups: [],
        lastLoginAt: null,
        createdAt: now,
      },
      $inc: { version: 1 },
    },
    { upsert: true, returnDocument: "after" }
  );
  if (!identity) throw new Error("Unable to create external identity");
  const mapped = mappedTenantAccess(input.connection, identity.groups);
  const role = mapped?.role ??
    (["ADMIN", "INCIDENT_MANAGER", "RESPONDER", "VIEWER"].includes(
      String(input.connection.defaultRole)
    )
      ? input.connection.defaultRole as "ADMIN" | "INCIDENT_MANAGER" | "RESPONDER" | "VIEWER"
      : "VIEWER");
  await collections.memberships().updateOne(
    { orgId: input.connection.orgId, userId: user._id },
    {
      $set: {
        role,
        status: input.active === false ? "REVOKED" : "ACTIVE",
        pageIds: mapped?.pageIds ?? null,
        activatedAt: input.active === false ? null : now,
      },
      $setOnInsert: {
        _id: new ObjectId(),
        invitationExpiresAt: null,
        invitationTokenHash: null,
        createdAt: now,
      },
    },
    { upsert: true }
  );
  if (input.active === false) {
    await collections.authSessions().updateMany(
      { userId: user._id, orgId: input.connection.orgId, revokedAt: null },
      { $set: { revokedAt: now, revokedReason: "scim-deprovisioned" } }
    );
  }
  return { user, identity, active: input.active !== false, version: identity.version ?? 1 };
}

export async function deprovisionScimUser(connection: IdentityConnectionDoc, identityId: ObjectId) {
  if (!connection.orgId) return false;
  const identity = await collections.externalIdentities().findOne({
    _id: identityId,
    connectionId: connection._id,
  });
  if (!identity?.userId) return false;
  const now = new Date();
  await collections.memberships().updateOne(
    { orgId: connection.orgId, userId: identity.userId },
    { $set: { status: "REVOKED" } }
  );
  await collections.authSessions().updateMany(
    { userId: identity.userId, orgId: connection.orgId, revokedAt: null },
    { $set: { revokedAt: now, revokedReason: "scim-deprovisioned" } }
  );
  const remainingAccess = await collections.memberships().countDocuments({
    userId: identity.userId,
    status: "ACTIVE",
  });
  if (!remainingAccess) {
    await collections.users().updateOne(
      { _id: identity.userId },
      { $set: { disabled: true, updatedAt: now } }
    );
  }
  return true;
}

export async function synchronizeScimGroupMemberships(connection: IdentityConnectionDoc) {
  if (!connection.orgId) return;
  const [groups, identities] = await Promise.all([
    collections.scimGroups().find({ connectionId: connection._id }).toArray(),
    collections.externalIdentities().find({
      connectionId: connection._id,
      userId: { $ne: null },
    }).toArray(),
  ]);
  for (const identity of identities) {
    if (!identity.userId) continue;
    const memberGroups = groups
      .filter((group) => group.memberExternalIds.includes(identity._id.toHexString()))
      .map((group) => group.displayName);
    await collections.externalIdentities().updateOne(
      { _id: identity._id },
      { $set: { groups: memberGroups, updatedAt: new Date() } }
    );
    const mapped = mappedTenantAccess(connection, memberGroups);
    if (mapped) {
      await collections.memberships().updateOne(
        { orgId: connection.orgId, userId: identity.userId },
        { $set: { role: mapped.role, pageIds: mapped.pageIds, status: "ACTIVE" } }
      );
    }
  }
}

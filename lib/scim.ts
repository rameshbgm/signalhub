import { NextRequest, NextResponse } from "next/server";
import { canonicalizeEmail, canonicalizeUsername, usernameError } from "@/lib/identity";
import { mappedTenantAccess } from "@/lib/identity-connections";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import type { IdentityConnectionRow, ScimGroupRow } from "@/lib/postgres/schema";
import { hashSecret } from "@/lib/secrets";

export const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
export const SCIM_GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";

export function scimGroupResource(group: Pick<ScimGroupRow, "id" | "externalId" | "displayName" | "memberExternalIds" | "version" | "createdAt" | "updatedAt">) {
  return {
    schemas: [SCIM_GROUP_SCHEMA], id: group.id, externalId: group.externalId ?? undefined,
    displayName: group.displayName, members: group.memberExternalIds.map((value) => ({ value })),
    meta: { resourceType: "Group", created: group.createdAt.toISOString(), lastModified: group.updatedAt.toISOString(), version: `W/"${group.version}"` },
  };
}

export function scimError(status: number, detail: string, scimType?: string) {
  return NextResponse.json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], status: String(status), detail,
    ...(scimType ? { scimType } : {}),
  }, { status });
}

export async function authenticateScim(request: NextRequest, connectionSlug: string) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return null;
  const now = new Date();
  const result = await database.selectFrom("scimTokens as token")
    .innerJoin("identityConnections as connection", "connection.id", "token.connectionId")
    .selectAll("connection").select("token.id as tokenId")
    .where("token.tokenHash", "=", hashSecret(token)).where("token.revokedAt", "is", null)
    .where((expression) => expression.or([expression("token.expiresAt", "is", null), expression("token.expiresAt", ">", now)]))
    .where("connection.slug", "=", connectionSlug).where("connection.audience", "=", "ORGANIZATION")
    .where("connection.enabled", "=", true).where("connection.orgId", "is not", null).executeTakeFirst();
  if (!result) return null;
  const { tokenId, ...connection } = result;
  await database.updateTable("scimTokens").set({ lastUsedAt: now }).where("id", "=", tokenId).execute();
  return connection;
}

export function parseScimPagination(request: NextRequest) {
  const startIndex = Math.max(1, Number(request.nextUrl.searchParams.get("startIndex") ?? 1));
  const count = Math.max(1, Math.min(200, Number(request.nextUrl.searchParams.get("count") ?? 100)));
  return { startIndex, count, skip: startIndex - 1 };
}

export function scimList(resources: unknown[], totalResults: number, startIndex: number) {
  return { schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"], totalResults, startIndex, itemsPerPage: resources.length, Resources: resources };
}

export function scimUserResource(input: {
  id: string; externalId?: string | null; username: string; email: string; name: string;
  active: boolean; version: number; createdAt: Date; updatedAt: Date;
}) {
  return {
    schemas: [SCIM_USER_SCHEMA], id: input.id, externalId: input.externalId ?? undefined,
    userName: input.username, active: input.active, displayName: input.name,
    name: { formatted: input.name }, emails: [{ value: input.email, primary: true, type: "work" }],
    meta: { resourceType: "User", created: input.createdAt.toISOString(), lastModified: input.updatedAt.toISOString(), version: `W/"${input.version}"` },
  };
}

export async function provisionScimUser(input: {
  connection: IdentityConnectionRow; externalId?: string | null; userName: string;
  email: string; displayName?: string | null; active?: boolean;
}) {
  if (!input.connection.orgId) throw new Error("SCIM connection has no organization");
  const organizationId = input.connection.orgId;
  const canonicalUsername = canonicalizeUsername(input.userName);
  const invalidUsername = usernameError(canonicalUsername);
  if (invalidUsername) throw new Error(invalidUsername);
  const canonicalEmail = canonicalizeEmail(input.email);
  if (!canonicalEmail.includes("@")) throw new Error("A primary communication email is required");
  return withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(organizationId, transaction);
    const now = new Date();
    let user = await transaction.selectFrom("users").selectAll().where("canonicalUsername", "=", canonicalUsername).forUpdate().executeTakeFirst();
    if (!user) {
      user = await transaction.insertInto("users").values({
        username: canonicalUsername, canonicalUsername, email: input.email.trim(), canonicalEmail,
        passwordHash: null, name: input.displayName?.trim() || canonicalUsername,
        twoFactorEnabled: false, disabled: input.active === false, mustChangePassword: false,
        mustCompleteProfile: false, sessionVersion: 1, mfaRequired: false,
        totpSecretCiphertext: null, pendingTotpSecretCiphertext: null,
        recoveryCodeHashes: [], mfaEnrolledAt: null, createdAt: now, updatedAt: now,
      }).returningAll().executeTakeFirstOrThrow();
    } else {
      user = await transaction.updateTable("users").set({
        email: input.email.trim(), canonicalEmail,
        ...(input.displayName?.trim() ? { name: input.displayName.trim() } : {}),
        ...(input.active === true ? { disabled: false } : {}), updatedAt: now,
      }).where("id", "=", user.id).returningAll().executeTakeFirstOrThrow();
    }
    const subject = input.externalId?.trim() || canonicalUsername;
    const identity = await transaction.insertInto("externalIdentities").values({
      connectionId: input.connection.id, userId: user.id, subject, canonicalEmail,
      groups: [], version: 1, lastLoginAt: null, createdAt: now, updatedAt: now,
    }).onConflict((conflict) => conflict.columns(["connectionId", "subject"]).doUpdateSet((expression) => ({
      userId: user!.id, canonicalEmail, updatedAt: now,
      version: expression("externalIdentities.version", "+", 1),
    }))).returningAll().executeTakeFirstOrThrow();
    const mapped = mappedTenantAccess(input.connection, identity.groups);
    const role = mapped?.role ?? input.connection.defaultRole ?? "VIEWER";
    await transaction.insertInto("memberships").values({
      orgId: organizationId, userId: user.id, role,
      status: input.active === false ? "REVOKED" : "ACTIVE",
      pageIds: mapped?.pageIds ?? null, activatedAt: input.active === false ? null : now,
      invitationExpiresAt: null, invitationTokenHash: null, createdAt: now,
    }).onConflict((conflict) => conflict.columns(["orgId", "userId"]).doUpdateSet({
      role, status: input.active === false ? "REVOKED" : "ACTIVE",
      pageIds: mapped?.pageIds ?? null, activatedAt: input.active === false ? null : now,
    })).execute();
    if (input.active === false) {
      await transaction.updateTable("authSessions").set({ revokedAt: now, revokedReason: "scim-deprovisioned" })
        .where("userId", "=", user.id).where("orgId", "=", organizationId).where("revokedAt", "is", null).execute();
    }
    return { user, identity, active: input.active !== false, version: identity.version };
  });
}

export async function deprovisionScimUser(connection: IdentityConnectionRow, identityId: string) {
  if (!connection.orgId) return false;
  return withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(connection.orgId!, transaction);
    const identity = await transaction.selectFrom("externalIdentities").selectAll()
      .where("id", "=", identityId).where("connectionId", "=", connection.id).forUpdate().executeTakeFirst();
    if (!identity?.userId) return false;
    const now = new Date();
    await transaction.updateTable("memberships").set({ status: "REVOKED" })
      .where("orgId", "=", connection.orgId!).where("userId", "=", identity.userId).execute();
    await transaction.updateTable("authSessions").set({ revokedAt: now, revokedReason: "scim-deprovisioned" })
      .where("userId", "=", identity.userId).where("orgId", "=", connection.orgId!)
      .where("revokedAt", "is", null).execute();
    const remaining = await transaction.selectFrom("memberships").select((expression) => expression.fn.countAll<number>().as("count"))
      .where("userId", "=", identity.userId).where("status", "=", "ACTIVE").executeTakeFirstOrThrow();
    if (Number(remaining.count) === 0) await transaction.updateTable("users").set({ disabled: true, updatedAt: now })
      .where("id", "=", identity.userId).execute();
    return true;
  });
}

export async function synchronizeScimGroupMemberships(connection: IdentityConnectionRow) {
  if (!connection.orgId) return;
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(connection.orgId!, transaction);
    const [groups, identities] = await Promise.all([
      transaction.selectFrom("scimGroups").selectAll().where("connectionId", "=", connection.id).execute(),
      transaction.selectFrom("externalIdentities").selectAll().where("connectionId", "=", connection.id)
        .where("userId", "is not", null).execute(),
    ]);
    for (const identity of identities) {
      if (!identity.userId) continue;
      const memberGroups = groups.filter((group) => group.memberExternalIds.includes(identity.id)).map((group) => group.displayName);
      await transaction.updateTable("externalIdentities").set({ groups: memberGroups, updatedAt: new Date() })
        .where("id", "=", identity.id).execute();
      const mapped = mappedTenantAccess(connection, memberGroups);
      if (mapped) await transaction.updateTable("memberships").set({ role: mapped.role, pageIds: mapped.pageIds, status: "ACTIVE" })
        .where("orgId", "=", connection.orgId!).where("userId", "=", identity.userId).execute();
    }
  });
}

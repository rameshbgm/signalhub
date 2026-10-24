import { readRequestJson } from "@/lib/request-body";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isDatabaseId } from "@/lib/database-id";
import { canonicalizeUsername, usernameError } from "@/lib/identity";
import { database } from "@/lib/postgres/client";
import type { IdentityConnectionRow } from "@/lib/postgres/schema";
import { authenticateScim, deprovisionScimUser, provisionScimUser, ScimIdentityConflictError, scimError, scimUserResource } from "@/lib/scim";

const updateSchema = z.object({
  active: z.boolean().optional(),
  userName: z.string().trim().min(3).max(64).optional(),
  displayName: z.string().trim().max(255).optional(),
  Operations: z.array(z.object({
    op: z.string().optional(), path: z.string().optional(), value: z.unknown().optional(),
  })).max(100).optional(),
});

async function resource(connection: IdentityConnectionRow, identityId: string) {
  if (!connection.orgId) return null;
  const row = await database.selectFrom("externalIdentities as identity")
    .innerJoin("users as user", "user.id", "identity.userId")
    .leftJoin("memberships as membership", (join) => join
      .onRef("membership.userId", "=", "user.id").on("membership.orgId", "=", connection.orgId!))
    .select([
      "identity.id", "identity.subject", "identity.version", "identity.createdAt", "identity.updatedAt",
      "user.username", "user.email", "user.name", "user.disabled", "membership.status as membershipStatus",
    ]).where("identity.id", "=", identityId).where("identity.connectionId", "=", connection.id).executeTakeFirst();
  return row ? scimUserResource({
    id: row.id, externalId: row.subject, username: row.username, email: row.email, name: row.name,
    active: !row.disabled && row.membershipStatus === "ACTIVE", version: row.version,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  }) : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ connection: string; id: string }> }) {
  const { connection: slug, id } = await params;
  const connection = await authenticateScim(request, slug);
  if (!connection) return scimError(401, "A valid SCIM bearer token is required");
  if (!isDatabaseId(id)) return scimError(404, "User not found");
  const found = await resource(connection, id);
  return found ? NextResponse.json(found, { headers: { etag: found.meta.version } }) : scimError(404, "User not found");
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ connection: string; id: string }> }) {
  const { connection: slug, id } = await params;
  const connection = await authenticateScim(request, slug);
  if (!connection) return scimError(401, "A valid SCIM bearer token is required");
  if (!isDatabaseId(id)) return scimError(404, "User not found");
  const identity = await database.selectFrom("externalIdentities").selectAll()
    .where("id", "=", id).where("connectionId", "=", connection.id).executeTakeFirst();
  if (!identity?.userId) return scimError(404, "User not found");
  const ifMatch = request.headers.get("if-match");
  if (ifMatch && ifMatch !== `W/"${identity.version}"`) return scimError(412, "Resource version does not match");
  const requestBody = await readRequestJson(request);
  if (requestBody instanceof Response) return requestBody;
  const parsed = updateSchema.safeParse(requestBody);
  if (!parsed.success) return scimError(400, "Invalid user update", "invalidValue");
  const body = parsed.data;
  let active = body.active;
  let userName = body.userName;
  let displayName = body.displayName;
  for (const operation of body.Operations ?? []) {
    const path = operation.path?.toLowerCase();
    if ((path === "active" && typeof operation.value !== "boolean") ||
      (["username", "displayname", "name.formatted"].includes(path ?? "") && typeof operation.value !== "string")) {
      return scimError(400, "Invalid operation value", "invalidValue");
    }
    if (path === "active" && typeof operation.value === "boolean") active = operation.value;
    if (path === "username" && typeof operation.value === "string") userName = operation.value;
    if ((path === "displayname" || path === "name.formatted") && typeof operation.value === "string") displayName = operation.value;
  }
  const fields = updateSchema.safeParse({ active, userName, displayName });
  if (!fields.success) return scimError(400, "Invalid user update", "invalidValue");
  const user = await database.selectFrom("users").selectAll().where("id", "=", identity.userId).executeTakeFirst();
  if (!user) return scimError(404, "User not found");
  const canonicalUsername = userName ? canonicalizeUsername(userName) : null;
  const invalid = canonicalUsername ? usernameError(canonicalUsername) : null;
  if (invalid) return scimError(400, invalid, "invalidValue");
  try {
    // All profile changes go through the connection + subject ownership check.
    // An ordinary profile edit must not implicitly reactivate revoked access.
    await provisionScimUser({
      connection, externalId: identity.subject, userName: canonicalUsername ?? user.username,
      email: user.email, displayName: displayName ?? user.name, active,
    });
    if (active === false) await deprovisionScimUser(connection, identity.id);
  } catch (error) {
    if (error instanceof ScimIdentityConflictError || (error as { code?: string }).code === "23505") {
      return scimError(409, "User identity conflicts with an existing account", "uniqueness");
    }
    throw error;
  }
  const updated = await resource(connection, id);
  return updated ? NextResponse.json(updated, { headers: { etag: updated.meta.version } }) : scimError(404, "User not found");
}

export async function PUT(request: NextRequest, context: { params: Promise<{ connection: string; id: string }> }) {
  return PATCH(request, context);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ connection: string; id: string }> }) {
  const { connection: slug, id } = await params;
  const connection = await authenticateScim(request, slug);
  if (!connection) return scimError(401, "A valid SCIM bearer token is required");
  if (!isDatabaseId(id)) return scimError(404, "User not found");
  const removed = await deprovisionScimUser(connection, id);
  return removed ? new NextResponse(null, { status: 204 }) : scimError(404, "User not found");
}

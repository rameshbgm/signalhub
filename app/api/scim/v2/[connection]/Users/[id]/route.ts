import { NextRequest, NextResponse } from "next/server";
import { isDatabaseId } from "@/lib/database-id";
import { canonicalizeUsername, usernameError } from "@/lib/identity";
import { database } from "@/lib/postgres/client";
import type { IdentityConnectionRow } from "@/lib/postgres/schema";
import { authenticateScim, deprovisionScimUser, provisionScimUser, scimError, scimUserResource } from "@/lib/scim";

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
  const body = await request.json().catch(() => ({})) as {
    active?: boolean; userName?: string; displayName?: string;
    Operations?: Array<{ op?: string; path?: string; value?: unknown }>;
  };
  let active = body.active;
  let userName = body.userName;
  let displayName = body.displayName;
  for (const operation of body.Operations ?? []) {
    const path = operation.path?.toLowerCase();
    if (path === "active" && typeof operation.value === "boolean") active = operation.value;
    if (path === "username" && typeof operation.value === "string") userName = operation.value;
    if ((path === "displayname" || path === "name.formatted") && typeof operation.value === "string") displayName = operation.value;
  }
  const user = await database.selectFrom("users").selectAll().where("id", "=", identity.userId).executeTakeFirst();
  if (!user) return scimError(404, "User not found");
  const canonicalUsername = userName ? canonicalizeUsername(userName) : null;
  const invalid = canonicalUsername ? usernameError(canonicalUsername) : null;
  if (invalid) return scimError(400, invalid, "invalidValue");
  if (active === false) {
    await deprovisionScimUser(connection, identity.id);
  } else {
    await provisionScimUser({
      connection, externalId: identity.subject, userName: canonicalUsername ?? user.username,
      email: user.email, displayName: displayName ?? user.name, active: true,
    });
  }
  if (canonicalUsername || displayName) {
    await database.updateTable("users").set({
      ...(canonicalUsername ? { username: canonicalUsername, canonicalUsername } : {}),
      ...(displayName ? { name: displayName } : {}), updatedAt: new Date(),
    }).where("id", "=", user.id).execute();
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

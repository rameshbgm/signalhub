import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/lib/db";
import { canonicalizeUsername, usernameError } from "@/lib/identity";
import { oid } from "@/lib/mongo-utils";
import {
  authenticateScim,
  deprovisionScimUser,
  provisionScimUser,
  scimError,
  scimUserResource,
} from "@/lib/scim";

async function resource(connectionId: string, identityId: string) {
  const identity = await collections.externalIdentities().findOne({
    _id: oid(identityId),
    connectionId: oid(connectionId),
  });
  if (!identity?.userId) return null;
  const [user, connection] = await Promise.all([
    collections.users().findOne({ _id: identity.userId }),
    collections.identityConnections().findOne({ _id: identity.connectionId }),
  ]);
  if (!user || !connection?.orgId) return null;
  const membership = await collections.memberships().findOne({
    orgId: connection.orgId,
    userId: user._id,
  });
  return scimUserResource({
    id: identity._id.toHexString(),
    externalId: identity.subject,
    username: user.username,
    email: user.email,
    name: user.name,
    active: !user.disabled && membership?.status === "ACTIVE",
    version: identity.version ?? 1,
    createdAt: identity.createdAt,
    updatedAt: identity.updatedAt,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ connection: string; id: string }> }
) {
  const { connection: slug, id } = await params;
  const connection = await authenticateScim(request, slug);
  if (!connection) return scimError(401, "A valid SCIM bearer token is required");
  const found = await resource(connection._id.toHexString(), id);
  if (!found) return scimError(404, "User not found");
  return NextResponse.json(found, { headers: { etag: found.meta.version } });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ connection: string; id: string }> }
) {
  const { connection: slug, id } = await params;
  const connection = await authenticateScim(request, slug);
  if (!connection) return scimError(401, "A valid SCIM bearer token is required");
  const identity = await collections.externalIdentities().findOne({
    _id: oid(id),
    connectionId: connection._id,
  });
  if (!identity?.userId) return scimError(404, "User not found");
  const ifMatch = request.headers.get("if-match");
  if (ifMatch && ifMatch !== `W/"${identity.version ?? 1}"`) {
    return scimError(412, "Resource version does not match");
  }
  const body = await request.json().catch(() => ({})) as {
    active?: boolean;
    userName?: string;
    displayName?: string;
    Operations?: Array<{ op?: string; path?: string; value?: unknown }>;
  };
  let active = body.active;
  let userName = body.userName;
  let displayName = body.displayName;
  for (const operation of body.Operations ?? []) {
    const path = operation.path?.toLowerCase();
    if (path === "active" && typeof operation.value === "boolean") active = operation.value;
    if (path === "username" && typeof operation.value === "string") userName = operation.value;
    if ((path === "displayname" || path === "name.formatted") && typeof operation.value === "string") {
      displayName = operation.value;
    }
  }
  const user = await collections.users().findOne({ _id: identity.userId });
  if (!user) return scimError(404, "User not found");
  if (userName && usernameError(canonicalizeUsername(userName))) {
    return scimError(400, usernameError(canonicalizeUsername(userName))!, "invalidValue");
  }
  await collections.users().updateOne(
    { _id: user._id },
    {
      $set: {
        ...(userName ? { username: canonicalizeUsername(userName), canonicalUsername: canonicalizeUsername(userName) } : {}),
        ...(displayName ? { name: displayName } : {}),
        ...(active === true ? { disabled: false } : {}),
        updatedAt: new Date(),
      },
    }
  );
  if (active === false) {
    await deprovisionScimUser(connection, identity._id);
  } else {
    await provisionScimUser({
      connection,
      externalId: identity.subject,
      userName: userName ?? user.username,
      email: user.email,
      displayName: displayName ?? user.name,
      active: true,
    });
  }
  const updated = await resource(connection._id.toHexString(), id);
  return updated
    ? NextResponse.json(updated, { headers: { etag: updated.meta.version } })
    : scimError(404, "User not found");
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ connection: string; id: string }> }
) {
  return PATCH(request, context);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ connection: string; id: string }> }
) {
  const { connection: slug, id } = await params;
  const connection = await authenticateScim(request, slug);
  if (!connection) return scimError(401, "A valid SCIM bearer token is required");
  const removed = await deprovisionScimUser(connection, oid(id));
  return removed ? new NextResponse(null, { status: 204 }) : scimError(404, "User not found");
}

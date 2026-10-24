import { readRequestJson } from "@/lib/request-body";
import { NextRequest, NextResponse } from "next/server";
import { parseScimGroupUpdate } from "@/lib/scim-group-update";
import { isDatabaseId } from "@/lib/database-id";
import { database } from "@/lib/postgres/client";
import { authenticateScim, scimError, scimGroupResource, synchronizeScimGroupMemberships } from "@/lib/scim";

export async function GET(request: NextRequest, { params }: { params: Promise<{ connection: string; id: string }> }) {
  const { connection: slug, id } = await params;
  const connection = await authenticateScim(request, slug);
  if (!connection) return scimError(401, "A valid SCIM bearer token is required");
  if (!isDatabaseId(id)) return scimError(404, "Group not found");
  const group = await database.selectFrom("scimGroups").selectAll().where("id", "=", id)
    .where("connectionId", "=", connection.id).executeTakeFirst();
  if (!group) return scimError(404, "Group not found");
  const ifMatch = request.headers.get("if-match");
  if (ifMatch && ifMatch !== `W/"${group.version}"`) return scimError(412, "Resource version does not match");
  const body = scimGroupResource(group);
  return NextResponse.json(body, { headers: { etag: body.meta.version } });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ connection: string; id: string }> }) {
  const { connection: slug, id } = await params;
  const connection = await authenticateScim(request, slug);
  if (!connection) return scimError(401, "A valid SCIM bearer token is required");
  if (!isDatabaseId(id)) return scimError(404, "Group not found");
  const group = await database.selectFrom("scimGroups").selectAll().where("id", "=", id)
    .where("connectionId", "=", connection.id).executeTakeFirst();
  if (!group) return scimError(404, "Group not found");
  const ifMatch = request.headers.get("if-match");
  if (ifMatch && ifMatch !== `W/"${group.version}"`) return scimError(412, "Resource version does not match");
  const requestBody = await readRequestJson(request);
  if (requestBody instanceof Response) return requestBody;
  const parsed = parseScimGroupUpdate(requestBody, group.memberExternalIds);
  if (!parsed) return scimError(400, "Invalid group update or unsupported operation", "invalidValue");
  const { displayName } = parsed;
  let { members } = parsed;
  if (members) {
    const uniqueMembers = [...new Set(members)];
    if (uniqueMembers.some((value) => !isDatabaseId(value))) return scimError(400, "Group member IDs must reference SCIM users", "invalidValue");
    const found = uniqueMembers.length ? await database.selectFrom("externalIdentities").select("id")
      .where("connectionId", "=", connection.id).where("id", "in", uniqueMembers).execute() : [];
    if (found.length !== uniqueMembers.length) return scimError(400, "One or more group members do not exist", "invalidValue");
    members = uniqueMembers;
  }
  const updated = await database.updateTable("scimGroups").set((expression) => ({
    ...(displayName ? { displayName } : {}), ...(members ? { memberExternalIds: members } : {}),
    updatedAt: new Date(), version: expression("version", "+", 1),
  })).where("id", "=", group.id).where("version", "=", group.version).returningAll().executeTakeFirst();
  if (!updated) return scimError(412, "Resource changed during update");
  await synchronizeScimGroupMemberships(connection);
  const resource = scimGroupResource(updated);
  return NextResponse.json(resource, { headers: { etag: resource.meta.version } });
}

export async function PUT(request: NextRequest, context: { params: Promise<{ connection: string; id: string }> }) {
  return PATCH(request, context);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ connection: string; id: string }> }) {
  const { connection: slug, id } = await params;
  const connection = await authenticateScim(request, slug);
  if (!connection) return scimError(401, "A valid SCIM bearer token is required");
  if (!isDatabaseId(id)) return scimError(404, "Group not found");
  const deleted = await database.deleteFrom("scimGroups").where("id", "=", id)
    .where("connectionId", "=", connection.id).returning("id").executeTakeFirst();
  if (!deleted) return scimError(404, "Group not found");
  await synchronizeScimGroupMemberships(connection);
  return new NextResponse(null, { status: 204 });
}

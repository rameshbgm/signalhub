import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import {
  authenticateScim,
  scimError,
  scimGroupResource,
  synchronizeScimGroupMemberships,
} from "@/lib/scim";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ connection: string; id: string }> }
) {
  const { connection: slug, id } = await params;
  const connection = await authenticateScim(request, slug);
  if (!connection) return scimError(401, "A valid SCIM bearer token is required");
  const group = await collections.scimGroups().findOne({ _id: oid(id), connectionId: connection._id });
  if (!group) return scimError(404, "Group not found");
  const ifMatch = request.headers.get("if-match");
  if (ifMatch && ifMatch !== `W/"${group.version}"`) {
    return scimError(412, "Resource version does not match");
  }
  const body = scimGroupResource(group);
  return NextResponse.json(body, { headers: { etag: body.meta.version } });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ connection: string; id: string }> }
) {
  const { connection: slug, id } = await params;
  const connection = await authenticateScim(request, slug);
  if (!connection) return scimError(401, "A valid SCIM bearer token is required");
  const group = await collections.scimGroups().findOne({ _id: oid(id), connectionId: connection._id });
  if (!group) return scimError(404, "Group not found");
  const ifMatch = request.headers.get("if-match");
  if (ifMatch && ifMatch !== `W/"${group.version}"`) {
    return scimError(412, "Resource version does not match");
  }
  const body = await request.json().catch(() => ({})) as {
    displayName?: string;
    members?: Array<{ value: string }>;
    Operations?: Array<{ op?: string; path?: string; value?: unknown }>;
  };
  let displayName = body.displayName;
  let members = body.members?.map((member) => member.value);
  for (const operation of body.Operations ?? []) {
    const path = operation.path?.toLowerCase();
    const op = operation.op?.toLowerCase();
    if (path === "displayname" && typeof operation.value === "string") displayName = operation.value;
    if (path?.startsWith("members") && Array.isArray(operation.value)) {
      const values = operation.value.flatMap((item) =>
        item && typeof item === "object" && "value" in item && typeof item.value === "string"
          ? [item.value]
          : []
      );
      members = op === "add"
        ? [...new Set([...group.memberExternalIds, ...values])]
        : op === "remove"
          ? group.memberExternalIds.filter((value) => !values.includes(value))
          : values;
    }
  }
  if (members) {
    if (members.some((value) => !/^[a-f\d]{24}$/i.test(value))) {
      return scimError(400, "Group member IDs must reference SCIM users", "invalidValue");
    }
    const memberCount = await collections.externalIdentities().countDocuments({
      connectionId: connection._id,
      _id: { $in: members.map(oid) },
    });
    if (memberCount !== new Set(members).size) {
      return scimError(400, "One or more group members do not exist", "invalidValue");
    }
  }
  const now = new Date();
  const changed = await collections.scimGroups().updateOne(
    { _id: group._id, version: group.version },
    {
      $set: {
        ...(displayName ? { displayName } : {}),
        ...(members ? { memberExternalIds: members } : {}),
        updatedAt: now,
      },
      $inc: { version: 1 },
    }
  );
  if (!changed.modifiedCount) return scimError(412, "Resource changed during update");
  await synchronizeScimGroupMemberships(connection);
  const updated = await collections.scimGroups().findOne({ _id: group._id });
  if (!updated) return scimError(404, "Group not found");
  const resource = scimGroupResource(updated);
  return NextResponse.json(resource, { headers: { etag: resource.meta.version } });
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
  const deleted = await collections.scimGroups().deleteOne({
    _id: oid(id),
    connectionId: connection._id,
  });
  if (!deleted.deletedCount) return scimError(404, "Group not found");
  await synchronizeScimGroupMemberships(connection);
  return new NextResponse(null, { status: 204 });
}

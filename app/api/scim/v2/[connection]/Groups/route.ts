import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { collections } from "@/lib/db";
import {
  authenticateScim,
  parseScimPagination,
  scimError,
  scimGroupResource,
  scimList,
  synchronizeScimGroupMemberships,
} from "@/lib/scim";

const groupSchema = z.object({
  externalId: z.string().trim().max(255).optional(),
  displayName: z.string().trim().min(1).max(255),
  members: z.array(z.object({ value: z.string().regex(/^[a-f\d]{24}$/i) })).max(10_000).default([]),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ connection: string }> }
) {
  const { connection: slug } = await params;
  const connection = await authenticateScim(request, slug);
  if (!connection) return scimError(401, "A valid SCIM bearer token is required");
  const { startIndex, count, skip } = parseScimPagination(request);
  const filter = request.nextUrl.searchParams.get("filter");
  const match = filter?.match(/^displayName\s+eq\s+"([^"]+)"$/i);
  if (filter && !match) return scimError(400, "Only the displayName eq filter is supported", "invalidFilter");
  const query = { connectionId: connection._id, ...(match ? { displayName: match[1] } : {}) };
  const [groups, total] = await Promise.all([
    collections.scimGroups().find(query).sort({ createdAt: 1 }).skip(skip).limit(count).toArray(),
    collections.scimGroups().countDocuments(query),
  ]);
  return NextResponse.json(scimList(groups.map(scimGroupResource), total, startIndex));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ connection: string }> }
) {
  const { connection: slug } = await params;
  const connection = await authenticateScim(request, slug);
  if (!connection) return scimError(401, "A valid SCIM bearer token is required");
  const parsed = groupSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return scimError(400, parsed.error.issues[0]?.message ?? "Invalid group", "invalidValue");
  const memberIds = parsed.data.members.map((member) => member.value);
  const members = await collections.externalIdentities().countDocuments({
    connectionId: connection._id,
    _id: { $in: memberIds.map((value) => new ObjectId(value)) },
  });
  if (members !== new Set(memberIds).size) {
    return scimError(400, "One or more group members do not exist", "invalidValue");
  }
  const now = new Date();
  const group = {
    _id: new ObjectId(),
    connectionId: connection._id,
    externalId: parsed.data.externalId ?? null,
    displayName: parsed.data.displayName,
    memberExternalIds: memberIds,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await collections.scimGroups().insertOne(group);
  } catch {
    return scimError(409, "Group already exists", "uniqueness");
  }
  await synchronizeScimGroupMemberships(connection);
  const body = scimGroupResource(group);
  return NextResponse.json(body, {
    status: 201,
    headers: {
      location: `/api/scim/v2/${encodeURIComponent(slug)}/Groups/${group._id.toHexString()}`,
      etag: body.meta.version,
    },
  });
}

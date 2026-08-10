import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isDatabaseId } from "@/lib/database-id";
import { database } from "@/lib/postgres/client";
import { authenticateScim, parseScimPagination, scimError, scimGroupResource, scimList, synchronizeScimGroupMemberships } from "@/lib/scim";

const groupSchema = z.object({
  externalId: z.string().trim().max(255).optional(),
  displayName: z.string().trim().min(1).max(255),
  members: z.array(z.object({ value: z.string().refine(isDatabaseId) })).max(10_000).default([]),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ connection: string }> }) {
  const { connection: slug } = await params;
  const connection = await authenticateScim(request, slug);
  if (!connection) return scimError(401, "A valid SCIM bearer token is required");
  const { startIndex, count, skip } = parseScimPagination(request);
  const filter = request.nextUrl.searchParams.get("filter");
  const match = filter?.match(/^displayName\s+eq\s+"([^"]+)"$/i);
  if (filter && !match) return scimError(400, "Only the displayName eq filter is supported", "invalidFilter");
  let query = database.selectFrom("scimGroups").where("connectionId", "=", connection.id);
  if (match) query = query.where("displayName", "=", match[1]);
  const [groups, totalRow] = await Promise.all([
    query.selectAll().orderBy("createdAt", "asc").offset(skip).limit(count).execute(),
    query.select((expression) => expression.fn.countAll<number>().as("count")).executeTakeFirstOrThrow(),
  ]);
  return NextResponse.json(scimList(groups.map(scimGroupResource), Number(totalRow.count), startIndex));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ connection: string }> }) {
  const { connection: slug } = await params;
  const connection = await authenticateScim(request, slug);
  if (!connection) return scimError(401, "A valid SCIM bearer token is required");
  const parsed = groupSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return scimError(400, parsed.error.issues[0]?.message ?? "Invalid group", "invalidValue");
  const memberIds = [...new Set(parsed.data.members.map((member) => member.value))];
  if (memberIds.length) {
    const members = await database.selectFrom("externalIdentities").select("id")
      .where("connectionId", "=", connection.id).where("id", "in", memberIds).execute();
    if (members.length !== memberIds.length) return scimError(400, "One or more group members do not exist", "invalidValue");
  }
  const now = new Date();
  let group;
  try {
    group = await database.insertInto("scimGroups").values({
      connectionId: connection.id, externalId: parsed.data.externalId ?? null,
      displayName: parsed.data.displayName, memberExternalIds: memberIds,
      version: 1, createdAt: now, updatedAt: now,
    }).returningAll().executeTakeFirstOrThrow();
  } catch {
    return scimError(409, "Group already exists", "uniqueness");
  }
  await synchronizeScimGroupMemberships(connection);
  const body = scimGroupResource(group);
  return NextResponse.json(body, { status: 201, headers: {
    location: `/api/scim/v2/${encodeURIComponent(slug)}/Groups/${group.id}`, etag: body.meta.version,
  }});
}

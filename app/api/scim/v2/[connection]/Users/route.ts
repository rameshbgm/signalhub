import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canonicalizeUsername } from "@/lib/identity";
import { database } from "@/lib/postgres/client";
import { authenticateScim, parseScimPagination, provisionScimUser, scimError, scimList, scimUserResource } from "@/lib/scim";

const userSchema = z.object({
  externalId: z.string().trim().max(255).optional(),
  userName: z.string().trim().min(3).max(64),
  emails: z.array(z.object({ value: z.string().email(), primary: z.boolean().optional() })).min(1),
  active: z.boolean().default(true),
  displayName: z.string().trim().max(255).optional(),
  name: z.object({ formatted: z.string().trim().max(255).optional() }).optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ connection: string }> }) {
  const { connection: slug } = await params;
  const connection = await authenticateScim(request, slug);
  if (!connection || !connection.orgId) return scimError(401, "A valid SCIM bearer token is required");
  const { startIndex, count, skip } = parseScimPagination(request);
  const filter = request.nextUrl.searchParams.get("filter");
  const match = filter?.match(/^userName\s+eq\s+"([^"]+)"$/i);
  if (filter && !match) return scimError(400, "Only the userName eq filter is supported", "invalidFilter");
  let query = database.selectFrom("externalIdentities as identity")
    .innerJoin("users as user", "user.id", "identity.userId")
    .leftJoin("memberships as membership", (join) => join
      .onRef("membership.userId", "=", "user.id").on("membership.orgId", "=", connection.orgId!))
    .where("identity.connectionId", "=", connection.id).where("identity.userId", "is not", null);
  if (match) query = query.where("user.canonicalUsername", "=", canonicalizeUsername(match[1]));
  const [rows, totalRow] = await Promise.all([
    query.select([
      "identity.id", "identity.subject", "identity.version", "identity.createdAt", "identity.updatedAt",
      "user.username", "user.email", "user.name", "user.disabled", "membership.status as membershipStatus",
    ]).orderBy("identity.createdAt", "asc").offset(skip).limit(count).execute(),
    query.select((expression) => expression.fn.countAll<number>().as("count")).executeTakeFirstOrThrow(),
  ]);
  const resources = rows.map((row) => scimUserResource({
    id: row.id, externalId: row.subject, username: row.username, email: row.email, name: row.name,
    active: !row.disabled && row.membershipStatus === "ACTIVE", version: row.version,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  }));
  return NextResponse.json(scimList(resources, Number(totalRow.count), startIndex));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ connection: string }> }) {
  const { connection: slug } = await params;
  const connection = await authenticateScim(request, slug);
  if (!connection) return scimError(401, "A valid SCIM bearer token is required");
  const parsed = userSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return scimError(400, parsed.error.issues[0]?.message ?? "Invalid user", "invalidValue");
  const canonicalUsername = canonicalizeUsername(parsed.data.userName);
  const existing = await database.selectFrom("externalIdentities as identity")
    .leftJoin("users as user", "user.id", "identity.userId").select("identity.id")
    .where("identity.connectionId", "=", connection.id)
    .where((expression) => parsed.data.externalId
      ? expression("identity.subject", "=", parsed.data.externalId)
      : expression("user.canonicalUsername", "=", canonicalUsername))
    .executeTakeFirst();
  if (existing) return scimError(409, "User already exists", "uniqueness");
  try {
    const result = await provisionScimUser({
      connection, externalId: parsed.data.externalId, userName: parsed.data.userName,
      email: parsed.data.emails.find((email) => email.primary)?.value ?? parsed.data.emails[0].value,
      displayName: parsed.data.displayName ?? parsed.data.name?.formatted, active: parsed.data.active,
    });
    const resource = scimUserResource({
      id: result.identity.id, externalId: result.identity.subject, username: result.user.username,
      email: result.user.email, name: result.user.name, active: result.active, version: result.version,
      createdAt: result.identity.createdAt, updatedAt: result.identity.updatedAt,
    });
    return NextResponse.json(resource, { status: 201, headers: {
      location: `/api/scim/v2/${encodeURIComponent(slug)}/Users/${result.identity.id}`, etag: resource.meta.version,
    }});
  } catch (error) {
    return scimError(400, error instanceof Error ? error.message : "Provisioning failed", "invalidValue");
  }
}

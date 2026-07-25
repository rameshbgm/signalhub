import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticateScim,
  parseScimPagination,
  provisionScimUser,
  scimError,
  scimList,
  scimUserResource,
} from "@/lib/scim";
import { collections } from "@/lib/db";
import { canonicalizeEmail } from "@/lib/identity";

const userSchema = z.object({
  externalId: z.string().trim().max(255).optional(),
  userName: z.string().email(),
  active: z.boolean().default(true),
  displayName: z.string().trim().max(255).optional(),
  name: z.object({ formatted: z.string().trim().max(255).optional() }).optional(),
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
  const match = filter?.match(/^userName\s+eq\s+"([^"]+)"$/i);
  if (filter && !match) return scimError(400, "Only the userName eq filter is supported", "invalidFilter");
  const identities = await collections
    .externalIdentities()
    .find({
      connectionId: connection._id,
      userId: { $ne: null },
      ...(match ? { canonicalEmail: canonicalizeEmail(match[1]) } : {}),
    })
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(count)
    .toArray();
  const totalResults = await collections.externalIdentities().countDocuments({
    connectionId: connection._id,
    userId: { $ne: null },
    ...(match ? { canonicalEmail: canonicalizeEmail(match[1]) } : {}),
  });
  const userIds = identities.flatMap((identity) => identity.userId ? [identity.userId] : []);
  const [users, memberships] = await Promise.all([
    collections.users().find({ _id: { $in: userIds } }).toArray(),
    collections.memberships().find({
      orgId: connection.orgId!,
      userId: { $in: userIds },
    }).toArray(),
  ]);
  const resources = identities.flatMap((identity) => {
    const user = users.find((item) => item._id.equals(identity.userId!));
    if (!user) return [];
    const membership = memberships.find((item) => item.userId.equals(user._id));
    return [scimUserResource({
      id: identity._id.toHexString(),
      externalId: identity.subject,
      email: user.email,
      name: user.name,
      active: !user.disabled && membership?.status === "ACTIVE",
      version: identity.version ?? 1,
      createdAt: identity.createdAt,
      updatedAt: identity.updatedAt,
    })];
  });
  return NextResponse.json(scimList(resources, totalResults, startIndex));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ connection: string }> }
) {
  const { connection: slug } = await params;
  const connection = await authenticateScim(request, slug);
  if (!connection) return scimError(401, "A valid SCIM bearer token is required");
  const parsed = userSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return scimError(400, parsed.error.issues[0]?.message ?? "Invalid user", "invalidValue");
  const existing = await collections.externalIdentities().findOne({
    connectionId: connection._id,
    $or: [
      { canonicalEmail: canonicalizeEmail(parsed.data.userName) },
      ...(parsed.data.externalId ? [{ subject: parsed.data.externalId }] : []),
    ],
  });
  if (existing) return scimError(409, "User already exists", "uniqueness");
  try {
    const result = await provisionScimUser({
      connection,
      externalId: parsed.data.externalId,
      userName: parsed.data.userName,
      displayName: parsed.data.displayName ?? parsed.data.name?.formatted,
      active: parsed.data.active,
    });
    const resource = scimUserResource({
      id: result.identity._id.toHexString(),
      externalId: result.identity.subject,
      email: result.user.email,
      name: result.user.name,
      active: result.active,
      version: result.version,
      createdAt: result.identity.createdAt,
      updatedAt: result.identity.updatedAt,
    });
    return NextResponse.json(resource, {
      status: 201,
      headers: {
        location: `/api/scim/v2/${encodeURIComponent(slug)}/Users/${result.identity._id.toHexString()}`,
        etag: resource.meta.version,
      },
    });
  } catch (error) {
    return scimError(400, error instanceof Error ? error.message : "Provisioning failed", "invalidValue");
  }
}

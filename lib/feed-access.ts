import type { NextRequest } from "next/server";
import type { PageDoc } from "@/lib/db";
import { collections } from "@/lib/db";
import { hashSecret } from "@/lib/secrets";
import { isPageOrganizationActive } from "@/lib/public-page";

export type SurfaceAccess =
  | { ok: true; visibleComponentIds: string[] | null; tokenId: string | null }
  | { ok: false };

export async function authorizePublicSurface(
  request: NextRequest,
  page: PageDoc
): Promise<SurfaceAccess> {
  if (!(await isPageOrganizationActive(page.orgId))) return { ok: false };
  if (page.type === "PUBLIC") {
    return { ok: true, visibleComponentIds: null, tokenId: null };
  }
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  const token =
    bearer ??
    request.nextUrl.searchParams.get("token") ??
    request.nextUrl.searchParams.get("feed_token");
  if (!token) return { ok: false };

  const now = new Date();
  const record = await collections.feedTokens().findOne({
    pageId: page._id,
    tokenHash: hashSecret(token),
    revokedAt: null,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  });
  if (!record) return { ok: false };
  await collections
    .feedTokens()
    .updateOne({ _id: record._id }, { $set: { lastUsedAt: now } });
  return {
    ok: true,
    visibleComponentIds: record.componentIds?.map((id) => id.toHexString()) ?? null,
    tokenId: record._id.toHexString(),
  };
}

import type { NextRequest } from "next/server";
import type { PageRow } from "@/lib/postgres/schema";
import { database } from "@/lib/postgres/client";
import { hashSecret } from "@/lib/secrets";
import { isPageOrganizationActive } from "@/lib/public-page";

export type SurfaceAccess =
  | { ok: true; visibleComponentIds: string[] | null; tokenId: string | null }
  | { ok: false };

export async function authorizePublicSurface(
  request: NextRequest,
  page: PageRow
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
  const record = await database
    .selectFrom("feedTokens")
    .selectAll()
    .where("pageId", "=", page.id)
    .where("tokenHash", "=", hashSecret(token))
    .where("revokedAt", "is", null)
    .where((expression) => expression.or([
      expression("expiresAt", "is", null),
      expression("expiresAt", ">", now),
    ]))
    .executeTakeFirst();
  if (!record) return { ok: false };
  await database
    .updateTable("feedTokens")
    .set({ lastUsedAt: now })
    .where("id", "=", record.id)
    .execute();
  return {
    ok: true,
    visibleComponentIds: record.componentIds ?? null,
    tokenId: record.id,
  };
}

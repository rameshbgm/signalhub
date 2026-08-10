import { NextRequest } from "next/server";
import { withDatabaseTransaction } from "@/lib/postgres/client";
import {
  fenceActiveOrganizationMutation,
  OrganizationMutationBlockedError,
} from "@/lib/organization-mutation";
import { hashSecret } from "@/lib/secrets";
import type { ApiKeyRow, ApiKeyScope } from "@/lib/postgres/schema";
import { requestIp } from "@/lib/rate-limit";
import { addressAllowed } from "@/lib/network-policy";

export async function authenticateApiKey(req: NextRequest, requiredScope?: ApiKeyScope) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;

  try {
    return await withDatabaseTransaction(async (transaction) => {
      const now = new Date();
      const apiKey = await transaction
        .selectFrom("apiKeys")
        .selectAll()
        .where("keyHash", "=", hashSecret(token))
        .where("revokedAt", "is", null)
        .where((expression) => expression.or([
          expression("expiresAt", "is", null),
          expression("expiresAt", ">", now),
        ]))
        .forUpdate()
        .executeTakeFirst();
      if (!apiKey) return null;
      if (requiredScope && !apiKey.scopes.includes(requiredScope)) return null;
      if (!addressAllowed(requestIp(req), apiKey.allowedCidrs ?? [])) return null;

      await fenceActiveOrganizationMutation(apiKey.orgId, transaction);
      const used = await transaction
        .updateTable("apiKeys")
        .set({ lastUsedAt: now })
        .where("id", "=", apiKey.id)
        .where("revokedAt", "is", null)
        .returning("id")
        .executeTakeFirst();
      return used ? apiKey : null;
    });
  } catch (error) {
    if (error instanceof OrganizationMutationBlockedError) return null;
    throw error;
  }
}

export function apiKeyAllowsPage(
  apiKey: Pick<ApiKeyRow, "pageIds">,
  pageId: string
) {
  return !apiKey.pageIds?.length || apiKey.pageIds.includes(pageId);
}

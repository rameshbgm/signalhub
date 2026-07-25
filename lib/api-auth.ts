import { NextRequest } from "next/server";
import { collections, mongoClient } from "@/lib/db";
import { toId } from "@/lib/mongo-utils";
import {
  fenceActiveOrganizationMutation,
  OrganizationMutationBlockedError,
} from "@/lib/organization-mutation";
import { hashSecret } from "@/lib/secrets";
import type { ApiKeyDoc, ApiKeyScope } from "@/lib/db";
import { requestIp } from "@/lib/rate-limit";
import { addressAllowed } from "@/lib/network-policy";

export async function authenticateApiKey(req: NextRequest, requiredScope?: ApiKeyScope) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;

  const databaseSession = mongoClient.startSession();
  try {
    return (
      (await databaseSession.withTransaction(async () => {
        const apiKeyDoc = await collections.apiKeys().findOne(
          {
            keyHash: hashSecret(token),
            revokedAt: null,
            $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
          },
          { session: databaseSession }
        );
        if (!apiKeyDoc) return null;
        if (requiredScope && !(apiKeyDoc.scopes ?? []).includes(requiredScope)) return null;
        const allowedCidrs = apiKeyDoc.allowedCidrs ?? [];
        if (!addressAllowed(requestIp(req), allowedCidrs)) {
          return null;
        }

        await fenceActiveOrganizationMutation(
          apiKeyDoc.orgId,
          databaseSession
        );
        const used = await collections.apiKeys().updateOne(
          { _id: apiKeyDoc._id, revokedAt: null },
          { $set: { lastUsedAt: new Date() } },
          { session: databaseSession }
        );
        return used.matchedCount === 1 ? toId(apiKeyDoc) : null;
      })) ?? null
    );
  } catch (error) {
    // Inactive organizations deliberately make their API keys indistinguishable
    // from missing or revoked credentials.
    if (error instanceof OrganizationMutationBlockedError) return null;
    throw error;
  } finally {
    await databaseSession.endSession();
  }
}

export function apiKeyAllowsPage(
  apiKey: Pick<ApiKeyDoc, "pageIds"> | { pageIds?: Array<string> | null },
  pageId: string
) {
  return (
    !apiKey.pageIds?.length ||
    apiKey.pageIds.some((allowedPageId) =>
      typeof allowedPageId === "string"
        ? allowedPageId === pageId
        : allowedPageId.toHexString() === pageId
    )
  );
}

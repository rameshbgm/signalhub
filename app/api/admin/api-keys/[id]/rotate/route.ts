import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin-guard";
import { apiError, routeError } from "@/lib/api-response";
import { isDatabaseId } from "@/lib/database-id";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { withDatabaseTransaction } from "@/lib/postgres/client";
import { generateApiKey } from "@/lib/tokens";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireCapability("integration.manage");
    const { id } = await params;
    if (!isDatabaseId(id)) return apiError(404, "API_KEY_NOT_FOUND", "API key not found");
    const secret = generateApiKey();
    const changed = await withDatabaseTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(session.orgId, transaction);
      const key = await transaction.updateTable("apiKeys").set({
        keyHash: secret.hash, prefix: secret.prefix, lastFour: secret.lastFour,
        lastUsedAt: null, legacyFullAccess: false,
      }).where("id", "=", id).where("orgId", "=", session.orgId).where("revokedAt", "is", null)
        .returning("id").executeTakeFirst();
      if (!key) return false;
      return true;
    });
    if (!changed) return apiError(404, "API_KEY_NOT_FOUND", "API key not found");
    return NextResponse.json({ token: secret.token, prefix: secret.prefix, lastFour: secret.lastFour });
  } catch (error) {
    return routeError(error, { route: "POST /api/admin/api-keys/:id/rotate" });
  }
}

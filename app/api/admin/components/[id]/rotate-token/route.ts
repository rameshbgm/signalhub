import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin-guard";
import { apiError, routeError } from "@/lib/api-response";
import { isDatabaseId } from "@/lib/database-id";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import { generateAutomationToken } from "@/lib/tokens";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireCapability("integration.manage");
    const { id } = await params;
    if (!isDatabaseId(id)) return apiError(404, "COMPONENT_NOT_FOUND", "Component not found");
    const component = await database.selectFrom("components as component")
      .innerJoin("pages as page", "page.id", "component.pageId")
      .select(["component.id", "component.pageId"]).where("component.id", "=", id)
      .where("page.orgId", "=", session.orgId).where("page.deletedAt", "is", null).executeTakeFirst();
    if (!component) return apiError(404, "COMPONENT_NOT_FOUND", "Component not found");
    const secret = generateAutomationToken();
    await withDatabaseTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(session.orgId, transaction);
      const updated = await transaction.updateTable("components").set({
        automationTokenHash: secret.hash,
        automationTokenPrefix: secret.prefix,
        automationTokenLastFour: secret.lastFour,
      }).where("id", "=", component.id).where("pageId", "=", component.pageId)
        .returning("id").executeTakeFirst();
      if (!updated) throw new Error("Component not found");
    });
    return NextResponse.json({ token: secret.token, prefix: secret.prefix, lastFour: secret.lastFour });
  } catch (error) {
    return routeError(error, { route: "POST /api/admin/components/:id/rotate-token" });
  }
}

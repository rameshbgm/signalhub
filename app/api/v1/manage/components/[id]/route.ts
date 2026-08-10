import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiKeyAllowsPage, authenticateApiKey } from "@/lib/api-auth";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { setComponentStatus } from "@/lib/component-status";
import { isDatabaseId } from "@/lib/database-id";
import { database } from "@/lib/postgres/client";
import { COMPONENT_STATUSES } from "@/lib/status";

const schema = z.object({ status: z.enum(COMPONENT_STATUSES) });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const apiKey = await authenticateApiKey(request, "components.write");
    if (!apiKey) return apiError(401, "UNAUTHENTICATED", "A valid API key is required");
    const { id } = await params;
    if (!isDatabaseId(id)) return apiError(404, "COMPONENT_NOT_FOUND", "Component not found");
    const component = await database.selectFrom("components as component")
      .innerJoin("pages as page", "page.id", "component.pageId")
      .select(["component.id", "page.id as pageId"])
      .where("component.id", "=", id).where("page.orgId", "=", apiKey.orgId)
      .where("page.deletedAt", "is", null).executeTakeFirst();
    if (!component) return apiError(404, "COMPONENT_NOT_FOUND", "Component not found");
    if (!apiKeyAllowsPage(apiKey, component.pageId)) {
      return apiError(404, "COMPONENT_NOT_FOUND", "Component not found");
    }
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    await setComponentStatus(component.id, parsed.data.status);
    const updated = await database.selectFrom("components").selectAll().where("id", "=", component.id).executeTakeFirstOrThrow();
    return NextResponse.json({ component: updated });
  } catch (error) {
    return routeError(error, { route: "PATCH /api/v1/manage/components/:id" });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiKeyAllowsPage, authenticateApiKey } from "@/lib/api-auth";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { setComponentStatus } from "@/lib/component-status";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { COMPONENT_STATUSES } from "@/lib/status";
import { activePageFilter } from "@/lib/page-lifecycle";

const schema = z.object({ status: z.enum(COMPONENT_STATUSES) });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const apiKey = await authenticateApiKey(request, "components.write");
    if (!apiKey) return apiError(401, "UNAUTHENTICATED", "A valid API key is required");
    const { id } = await params;
    const component = await collections.components().findOne({ _id: oid(id) });
    if (!component) return apiError(404, "COMPONENT_NOT_FOUND", "Component not found");
    const page = await collections.pages().findOne(activePageFilter({
      _id: component.pageId,
      orgId: oid(apiKey.orgId),
    }));
    if (!page || !apiKeyAllowsPage(apiKey, page._id.toHexString())) {
      return apiError(404, "COMPONENT_NOT_FOUND", "Component not found");
    }
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    await setComponentStatus(component._id, parsed.data.status);
    const updated = await collections.components().findOne({ _id: component._id });
    return NextResponse.json({ component: toId(updated!) });
  } catch (error) {
    return routeError(error);
  }
}

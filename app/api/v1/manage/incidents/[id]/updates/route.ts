import { NextRequest, NextResponse } from "next/server";
import { apiKeyAllowsPage, authenticateApiKey } from "@/lib/api-auth";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { addIncidentUpdate, incidentUpdateInputSchema } from "@/lib/domain/incidents";
import { isDatabaseId } from "@/lib/database-id";
import { database } from "@/lib/postgres/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const apiKey = await authenticateApiKey(request, "incidents.write");
    if (!apiKey) return apiError(401, "UNAUTHENTICATED", "A valid API key is required");
    const parsed = incidentUpdateInputSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const { id } = await params;
    if (!isDatabaseId(id)) return apiError(404, "INCIDENT_NOT_FOUND", "Incident not found");
    const incident = await database.selectFrom("incidents as incident")
      .innerJoin("pages as page", "page.id", "incident.pageId")
      .select("page.id as pageId").where("incident.id", "=", id)
      .where("page.orgId", "=", apiKey.orgId).where("page.deletedAt", "is", null).executeTakeFirst();
    if (!incident || !apiKeyAllowsPage(apiKey, incident.pageId)) {
      return apiError(404, "INCIDENT_NOT_FOUND", "Incident not found");
    }
    const update = await addIncidentUpdate(apiKey.orgId, id, parsed.data);
    return NextResponse.json({ update }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Incident not found") {
      return apiError(404, "INCIDENT_NOT_FOUND", "Incident not found");
    }
    return routeError(error, { route: "POST /api/v1/manage/incidents/:id/updates" });
  }
}

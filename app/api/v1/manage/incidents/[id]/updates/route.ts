import { NextRequest, NextResponse } from "next/server";
import { apiKeyAllowsPage, authenticateApiKey } from "@/lib/api-auth";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { addIncidentUpdate, incidentUpdateInputSchema } from "@/lib/domain/incidents";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";

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
    const incident = await collections.incidents().findOne({ _id: oid(id) });
    const page = incident
      ? await collections.pages().findOne({ _id: incident.pageId, orgId: oid(apiKey.orgId) })
      : null;
    if (!page || !apiKeyAllowsPage(apiKey, page._id.toHexString())) {
      return apiError(404, "INCIDENT_NOT_FOUND", "Incident not found");
    }
    const update = await addIncidentUpdate(apiKey.orgId, id, parsed.data);
    return NextResponse.json({ update }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Incident not found") {
      return apiError(404, "INCIDENT_NOT_FOUND", "Incident not found");
    }
    return routeError(error);
  }
}

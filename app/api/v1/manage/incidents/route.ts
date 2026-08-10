import { NextRequest, NextResponse } from "next/server";
import { apiKeyAllowsPage, authenticateApiKey } from "@/lib/api-auth";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { createIncident, createIncidentInputSchema } from "@/lib/domain/incidents";
import { database } from "@/lib/postgres/client";

export async function GET(request: NextRequest) {
  try {
    const apiKey = await authenticateApiKey(request, "incidents.read");
    if (!apiKey) return apiError(401, "UNAUTHENTICATED", "A valid API key is required");
    const pageId = request.nextUrl.searchParams.get("pageId");
    let pageQuery = database
      .selectFrom("pages")
      .select("id")
      .where("orgId", "=", apiKey.orgId)
      .where("deletedAt", "is", null);
    if (pageId) pageQuery = pageQuery.where("id", "=", pageId);
    if (apiKey.pageIds?.length) pageQuery = pageQuery.where("id", "in", apiKey.pageIds);
    const pages = await pageQuery.execute();
    if (pageId && !pages.length) return apiError(404, "PAGE_NOT_FOUND", "Page not found");
    const incidentDocs = pages.length
      ? await database
          .selectFrom("incidents")
          .selectAll()
          .where("pageId", "in", pages.map((page) => page.id))
          .orderBy("createdAt", "desc")
          .limit(100)
          .execute()
      : [];
    const incidentIds = incidentDocs.map((incident) => incident.id);
    const [updates, links] = await Promise.all([
      incidentIds.length
        ? database.selectFrom("incidentUpdates").selectAll().where("incidentId", "in", incidentIds).orderBy("createdAt", "asc").execute()
        : Promise.resolve([]),
      incidentIds.length
        ? database.selectFrom("incidentComponents").selectAll().where("incidentId", "in", incidentIds).execute()
        : Promise.resolve([]),
    ]);
    return NextResponse.json({
      incidents: incidentDocs.map((incident) => ({
        ...incident,
        updates: updates.filter((update) => update.incidentId === incident.id),
        components: links.filter((link) => link.incidentId === incident.id),
      })),
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = await authenticateApiKey(request, "incidents.write");
    if (!apiKey) return apiError(401, "UNAUTHENTICATED", "A valid API key is required");
    const parsed = createIncidentInputSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    if (!apiKeyAllowsPage(apiKey, parsed.data.pageId)) {
      return apiError(404, "PAGE_NOT_FOUND", "Page not found");
    }
    const incident = await createIncident(apiKey.orgId, parsed.data);
    return NextResponse.json({ incident }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Page not found")) {
      return apiError(404, "PAGE_NOT_FOUND", "Page not found");
    }
    if (error instanceof Error && error.message.includes("components")) {
      return apiError(400, "INVALID_COMPONENT_SCOPE", error.message);
    }
    return routeError(error);
  }
}

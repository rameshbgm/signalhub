import { NextRequest, NextResponse } from "next/server";
import { apiKeyAllowsPage, authenticateApiKey } from "@/lib/api-auth";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { collections } from "@/lib/db";
import { createIncident, createIncidentInputSchema } from "@/lib/domain/incidents";
import { oid, toId } from "@/lib/mongo-utils";

export async function GET(request: NextRequest) {
  try {
    const apiKey = await authenticateApiKey(request, "incidents.read");
    if (!apiKey) return apiError(401, "UNAUTHENTICATED", "A valid API key is required");
    const pageId = request.nextUrl.searchParams.get("pageId");
    const pages = await collections
      .pages()
      .find({
        orgId: oid(apiKey.orgId),
        ...(pageId ? { _id: oid(pageId) } : {}),
        ...(apiKey.pageIds?.length ? { _id: { $in: apiKey.pageIds } } : {}),
      })
      .toArray();
    if (pageId && !pages.length) return apiError(404, "PAGE_NOT_FOUND", "Page not found");
    const incidentDocs = await collections
      .incidents()
      .find({ pageId: { $in: pages.map((page) => page._id) } })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    const incidentIds = incidentDocs.map((incident) => incident._id);
    const [updates, links] = await Promise.all([
      incidentIds.length
        ? collections.incidentUpdates().find({ incidentId: { $in: incidentIds } }).sort({ createdAt: 1 }).toArray()
        : Promise.resolve([]),
      incidentIds.length
        ? collections.incidentComponents().find({ incidentId: { $in: incidentIds } }).toArray()
        : Promise.resolve([]),
    ]);
    return NextResponse.json({
      incidents: incidentDocs.map((incident) => ({
        ...toId(incident),
        updates: updates.filter((update) => update.incidentId.equals(incident._id)).map(toId),
        components: links.filter((link) => link.incidentId.equals(incident._id)).map(toId),
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

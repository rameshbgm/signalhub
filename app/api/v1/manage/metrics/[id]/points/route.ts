import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiKeyAllowsPage, authenticateApiKey } from "@/lib/api-auth";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { withTransaction } from "@/lib/cascade";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { activePageFilter } from "@/lib/page-lifecycle";

const schema = z.object({ value: z.number().finite(), timestamp: z.string().datetime().optional() });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const apiKey = await authenticateApiKey(request, "metrics.write");
    if (!apiKey) return apiError(401, "UNAUTHENTICATED", "A valid API key is required");
    const { id } = await params;
    const metric = await collections.metrics().findOne({ _id: oid(id) });
    if (!metric) return apiError(404, "METRIC_NOT_FOUND", "Metric not found");
    const page = await collections.pages().findOne(activePageFilter({
      _id: metric.pageId,
      orgId: oid(apiKey.orgId),
    }));
    if (!page || !apiKeyAllowsPage(apiKey, page._id.toHexString())) {
      return apiError(404, "METRIC_NOT_FOUND", "Metric not found");
    }
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const point = {
      _id: new ObjectId(),
      metricId: metric._id,
      value: parsed.data.value,
      timestamp: parsed.data.timestamp ? new Date(parsed.data.timestamp) : new Date(),
    };
    await withTransaction(async (databaseSession) => {
      await fenceActiveOrganizationMutation(apiKey.orgId, databaseSession);
      const currentMetric = await collections.metrics().findOne(
        { _id: metric._id },
        { session: databaseSession }
      );
      const currentPage = currentMetric
        ? await collections.pages().findOne(
            activePageFilter({ _id: currentMetric.pageId, orgId: oid(apiKey.orgId) }),
            { session: databaseSession }
          )
        : null;
      if (!currentMetric || !currentPage) {
        throw new Error("Metric is no longer available");
      }
      await collections.metricPoints().insertOne(
        { ...point, metricId: currentMetric._id },
        { session: databaseSession }
      );
    });
    return NextResponse.json({ point: toId(point) }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}

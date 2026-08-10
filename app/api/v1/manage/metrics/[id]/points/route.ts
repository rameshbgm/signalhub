import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiKeyAllowsPage, authenticateApiKey } from "@/lib/api-auth";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { isDatabaseId } from "@/lib/database-id";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";

const schema = z.object({ value: z.number().finite(), timestamp: z.string().datetime().optional() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const apiKey = await authenticateApiKey(request, "metrics.write");
    if (!apiKey) return apiError(401, "UNAUTHENTICATED", "A valid API key is required");
    const { id } = await params;
    if (!isDatabaseId(id)) return apiError(404, "METRIC_NOT_FOUND", "Metric not found");
    const metric = await database.selectFrom("metrics as metric")
      .innerJoin("pages as page", "page.id", "metric.pageId")
      .select(["metric.id", "page.id as pageId"]).where("metric.id", "=", id)
      .where("page.orgId", "=", apiKey.orgId).where("page.deletedAt", "is", null).executeTakeFirst();
    if (!metric || !apiKeyAllowsPage(apiKey, metric.pageId)) {
      return apiError(404, "METRIC_NOT_FOUND", "Metric not found");
    }
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const point = await withDatabaseTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(apiKey.orgId, transaction);
      const current = await transaction.selectFrom("metrics as metric")
        .innerJoin("pages as page", "page.id", "metric.pageId").select("metric.id")
        .where("metric.id", "=", metric.id).where("page.orgId", "=", apiKey.orgId)
        .where("page.deletedAt", "is", null).forShare("metric").executeTakeFirst();
      if (!current) throw new Error("Metric is no longer available");
      return transaction.insertInto("metricPoints").values({
        metricId: current.id,
        value: parsed.data.value,
        timestamp: parsed.data.timestamp ? new Date(parsed.data.timestamp) : new Date(),
      }).returningAll().executeTakeFirstOrThrow();
    });
    return NextResponse.json({ point }, { status: 201 });
  } catch (error) {
    return routeError(error, { route: "POST /api/v1/manage/metrics/:id/points" });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
import { z } from "zod";
import { consumeRateLimit, RateLimitError, requestIp } from "@/lib/rate-limit";
import { withDatabaseTransaction } from "@/lib/postgres/client";
import {
  fenceActiveOrganizationMutation,
  OrganizationMutationBlockedError,
} from "@/lib/organization-mutation";
import { getPublicPageBySlug } from "@/lib/pages";

const schema = z.object({
  pageSlug: z.string().trim().min(1).max(200),
  event: z.enum(["VIEW", "INCIDENT_VIEW", "SUBSCRIPTION_START", "SUBSCRIPTION_COMPLETE"]),
  referrer: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  if (request.headers.get("dnt") === "1") return new NextResponse(null, { status: 204 });
  try {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return new NextResponse(null, { status: 400 });
    await consumeRateLimit(`analytics:${parsed.data.pageSlug}`, requestIp(request), {
      limit: 120,
      windowMs: 60 * 60_000,
    });
    const page = await getPublicPageBySlug(parsed.data.pageSlug);
    if (!page?.analyticsEnabled) return new NextResponse(null, { status: 204 });

    const date = new Date().toISOString().slice(0, 10);
    let referrerDomain = "";
    if (parsed.data.referrer) {
      try {
        referrerDomain = new URL(parsed.data.referrer).hostname.slice(0, 120);
      } catch {
        referrerDomain = "";
      }
    }
    const now = new Date();
    const initial = {
      views: parsed.data.event === "VIEW" ? 1 : 0,
      incidentViews: parsed.data.event === "INCIDENT_VIEW" ? 1 : 0,
      subscriptionStarts: parsed.data.event === "SUBSCRIPTION_START" ? 1 : 0,
      subscriptionCompletions: parsed.data.event === "SUBSCRIPTION_COMPLETE" ? 1 : 0,
      referrers: parsed.data.event === "VIEW" && referrerDomain ? { [referrerDomain]: 1 } : {},
    };

    await withDatabaseTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(page.orgId, transaction);
      const currentPage = await transaction
        .selectFrom("pages")
        .select("id")
        .where("id", "=", page.id)
        .where("orgId", "=", page.orgId)
        .where("slug", "=", parsed.data.pageSlug)
        .where("analyticsEnabled", "=", true)
        .where("deletedAt", "is", null)
        .where("publicVisible", "=", true)
        .executeTakeFirst();
      if (!currentPage) return;
      await transaction
        .insertInto("analyticsDaily")
        .values({
          id: `${currentPage.id}:${date}`,
          pageId: currentPage.id,
          date,
          ...initial,
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60_000),
          updatedAt: now,
        })
        .onConflict((conflict) => conflict.column("id").doUpdateSet({
          views: sql<number>`analytics_daily.views + ${initial.views}`,
          incidentViews: sql<number>`analytics_daily.incident_views + ${initial.incidentViews}`,
          subscriptionStarts: sql<number>`analytics_daily.subscription_starts + ${initial.subscriptionStarts}`,
          subscriptionCompletions: sql<number>`analytics_daily.subscription_completions + ${initial.subscriptionCompletions}`,
          referrers: referrerDomain && parsed.data.event === "VIEW"
            ? sql<Record<string, number>>`jsonb_set(analytics_daily.referrers, array[${referrerDomain}], to_jsonb(coalesce((analytics_daily.referrers ->> ${referrerDomain})::integer, 0) + 1), true)`
            : sql<Record<string, number>>`analytics_daily.referrers`,
          updatedAt: now,
        }))
        .execute();
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RateLimitError || error instanceof OrganizationMutationBlockedError) {
      return new NextResponse(null, { status: 204 });
    }
    return new NextResponse(null, { status: 500 });
  }
}

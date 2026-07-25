import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { collections } from "@/lib/db";
import { consumeRateLimit, RateLimitError, requestIp } from "@/lib/rate-limit";
import { withTransaction } from "@/lib/cascade";
import {
  fenceActiveOrganizationMutation,
  OrganizationMutationBlockedError,
} from "@/lib/organization-mutation";

const schema = z.object({
  pageSlug: z.string().trim().min(1).max(200),
  event: z.enum(["VIEW", "INCIDENT_VIEW", "SUBSCRIPTION_START", "SUBSCRIPTION_COMPLETE"]),
  referrer: z.string().max(500).optional(),
});

const FIELD = {
  VIEW: "views",
  INCIDENT_VIEW: "incidentViews",
  SUBSCRIPTION_START: "subscriptionStarts",
  SUBSCRIPTION_COMPLETE: "subscriptionCompletions",
} as const;

export async function POST(request: NextRequest) {
  if (request.headers.get("dnt") === "1") return new NextResponse(null, { status: 204 });
  try {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return new NextResponse(null, { status: 400 });
    await consumeRateLimit(`analytics:${parsed.data.pageSlug}`, requestIp(request), {
      limit: 120,
      windowMs: 60 * 60_000,
    });
    const page = await collections.pages().findOne({
      slug: parsed.data.pageSlug,
      analyticsEnabled: true,
    });
    if (!page) return new NextResponse(null, { status: 204 });
    const date = new Date().toISOString().slice(0, 10);
    let referrerDomain = "";
    if (parsed.data.referrer) {
      try {
        referrerDomain = new URL(parsed.data.referrer).hostname.slice(0, 120);
      } catch {
        referrerDomain = "";
      }
    }
    const increments: Record<string, number> = { [FIELD[parsed.data.event]]: 1 };
    if (parsed.data.event === "VIEW" && referrerDomain) {
      increments[`referrers.${referrerDomain.replaceAll(".", "\uFF0E")}`] = 1;
    }
    await withTransaction(async (databaseSession) => {
      await fenceActiveOrganizationMutation(page.orgId, databaseSession);
      const currentPage = await collections.pages().findOne(
        {
          _id: page._id,
          orgId: page.orgId,
          slug: parsed.data.pageSlug,
          analyticsEnabled: true,
        },
        { session: databaseSession }
      );
      if (!currentPage) return;
      await collections.analyticsDaily().updateOne(
        { _id: `${currentPage._id.toHexString()}:${date}` },
        {
          $inc: increments,
          $set: { updatedAt: new Date() },
          $setOnInsert: {
            pageId: currentPage._id,
            date,
            expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60_000),
          },
        },
        { upsert: true, session: databaseSession }
      );
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (
      error instanceof RateLimitError ||
      error instanceof OrganizationMutationBlockedError
    ) {
      return new NextResponse(null, { status: 204 });
    }
    return new NextResponse(null, { status: 500 });
  }
}

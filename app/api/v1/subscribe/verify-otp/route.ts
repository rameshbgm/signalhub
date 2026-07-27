import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { collections } from "@/lib/db";
import { canonicalizeEmail } from "@/lib/identity";
import { consumeRateLimit, RateLimitError, requestIp } from "@/lib/rate-limit";
import { secretMatches } from "@/lib/secrets";
import { isPageOrganizationActive } from "@/lib/public-page";
import { withTransaction } from "@/lib/cascade";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { publicPageFilter } from "@/lib/page-lifecycle";

const schema = z.object({
  pageSlug: z.string().trim().min(1),
  channel: z.enum(["EMAIL", "SMS"]),
  contact: z.string().min(3).max(320),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    await consumeRateLimit(`otp-verify:${parsed.data.pageSlug}`, requestIp(request), {
      limit: 30,
      windowMs: 15 * 60_000,
    });
    const contact =
      parsed.data.channel === "EMAIL"
        ? canonicalizeEmail(parsed.data.contact)
        : parsed.data.contact.replace(/[\s()-]/g, "");
    const page = await collections.pages().findOne(publicPageFilter({ slug: parsed.data.pageSlug }));
    if (!page) return apiError(404, "PAGE_NOT_FOUND", "Page not found");
    if (!(await isPageOrganizationActive(page.orgId))) {
      return apiError(404, "PAGE_NOT_FOUND", "Page not found");
    }
    const otp = await collections
      .subscriptionOtps()
      .find({
        pageId: page._id.toHexString(),
        channel: parsed.data.channel,
        contact,
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 })
      .limit(1)
      .next();
    if (!otp || otp.attempts >= 5 || !secretMatches(parsed.data.code, otp.codeHash)) {
      if (otp) {
        await collections.subscriptionOtps().updateOne({ _id: otp._id }, { $inc: { attempts: 1 } });
      }
      return apiError(400, "INVALID_OTP", "Invalid or expired verification code");
    }

    await withTransaction(async (databaseSession) => {
      await fenceActiveOrganizationMutation(page.orgId, databaseSession);
      const currentPage = await collections.pages().findOne(
        publicPageFilter({ _id: page._id, orgId: page.orgId, slug: parsed.data.pageSlug }),
        { session: databaseSession }
      );
      const currentOtp = currentPage
        ? await collections.subscriptionOtps().findOne(
            {
              _id: otp._id,
              pageId: currentPage._id.toHexString(),
              channel: parsed.data.channel,
              contact,
              expiresAt: { $gt: new Date() },
              attempts: { $lt: 5 },
            },
            { session: databaseSession }
          )
        : null;
      if (!currentPage || !currentOtp || !secretMatches(parsed.data.code, currentOtp.codeHash)) {
        throw new Error("Verification state changed; request a new code");
      }
      await collections.subscribers().updateOne(
        { pageId: currentPage._id, channel: parsed.data.channel, contact },
        {
          $set: { verified: true, quarantined: false, componentIds: currentOtp.componentIds },
          $setOnInsert: {
            _id: new ObjectId(),
            pageId: currentPage._id,
            channel: parsed.data.channel,
            contact,
            unsubscribeToken: new ObjectId().toHexString(),
            createdAt: new Date(),
          },
        },
        { upsert: true, session: databaseSession }
      );
      await collections.subscriptionOtps().deleteMany(
        {
          pageId: currentPage._id.toHexString(),
          channel: parsed.data.channel,
          contact,
        },
        { session: databaseSession }
      );
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RateLimitError) {
      const response = apiError(429, "RATE_LIMITED", "Too many verification attempts");
      response.headers.set("retry-after", String(error.retryAfterSeconds));
      return response;
    }
    return routeError(error);
  }
}

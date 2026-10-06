import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkPageAccess } from "@/lib/access";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { canonicalizeEmail } from "@/lib/identity";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { getPublicPageBySlug } from "@/lib/pages";
import { withDatabaseTransaction } from "@/lib/postgres/client";
import { isPageOrganizationActive } from "@/lib/public-page";
import { consumeRateLimit, RateLimitError, requestIp } from "@/lib/rate-limit";
import { secretMatches } from "@/lib/secrets";

const MAX_OTP_ATTEMPTS = 5;

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
    await consumeRateLimit(`otp-verify:${parsed.data.pageSlug}`, requestIp(request), { limit: 30, windowMs: 15 * 60_000 });
    const contact = parsed.data.channel === "EMAIL"
      ? canonicalizeEmail(parsed.data.contact)
      : parsed.data.contact.replace(/[\s()-]/g, "");
    const page = await getPublicPageBySlug(parsed.data.pageSlug);
    if (!page || !(await isPageOrganizationActive(page.orgId))) return apiError(404, "PAGE_NOT_FOUND", "Page not found");
    if (!(await checkPageAccess(page)).ok) return apiError(404, "PAGE_NOT_FOUND", "Page not found");
    const verified = await withDatabaseTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(page.orgId, transaction);
      // The row lock serializes concurrent guesses so the attempt limit is exact.
      const currentOtp = await transaction.selectFrom("subscriptionOtps").selectAll()
        .where("pageId", "=", page.id).where("channel", "=", parsed.data.channel)
        .where("contact", "=", contact).where("expiresAt", ">", new Date())
        .orderBy("createdAt", "desc").forUpdate().executeTakeFirst();
      if (!currentOtp || currentOtp.attempts >= MAX_OTP_ATTEMPTS) return false;
      if (!secretMatches(parsed.data.code, currentOtp.codeHash)) {
        await transaction.updateTable("subscriptionOtps")
          .set((expression) => ({ attempts: expression("attempts", "+", 1) }))
          .where("id", "=", currentOtp.id).execute();
        return false;
      }
      await transaction.insertInto("subscribers").values({
        pageId: page.id,
        channel: parsed.data.channel,
        contact,
        verified: true,
        quarantined: false,
        componentIds: currentOtp.componentIds,
        eventTypes: [],
        unsubscribeToken: randomBytes(32).toString("base64url"),
        createdAt: new Date(),
      }).onConflict((conflict) => conflict.columns(["pageId", "channel", "contact"]).doUpdateSet({
        verified: true,
        quarantined: false,
        componentIds: currentOtp.componentIds,
      })).execute();
      await transaction.deleteFrom("subscriptionOtps").where("pageId", "=", page.id)
        .where("channel", "=", parsed.data.channel).where("contact", "=", contact).execute();
      return true;
    });
    if (!verified) return apiError(400, "INVALID_OTP", "Invalid or expired verification code");
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RateLimitError) {
      const response = apiError(429, "RATE_LIMITED", "Too many verification attempts");
      response.headers.set("retry-after", String(error.retryAfterSeconds));
      return response;
    }
    return routeError(error, { route: "POST /api/v1/subscribe/verify-otp" });
  }
}

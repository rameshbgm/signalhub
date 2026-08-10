import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkPageAccess } from "@/lib/access";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { isDatabaseId } from "@/lib/database-id";
import { canonicalizeEmail } from "@/lib/identity";
import { subscriptionCapabilities } from "@/lib/notification-capabilities";
import { enqueueDirectNotification, generateOtpCode } from "@/lib/notify";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { getPublicPageBySlug } from "@/lib/pages";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import { consumeRateLimit, RateLimitError, requestIp } from "@/lib/rate-limit";
import { hashSecret } from "@/lib/secrets";

const schema = z.object({
  pageSlug: z.string().trim().min(1),
  channel: z.enum(["EMAIL", "SMS"]),
  contact: z.string().min(3).max(320),
  componentIds: z.array(z.string()).max(500).default([]),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const contact = parsed.data.channel === "EMAIL"
      ? canonicalizeEmail(parsed.data.contact)
      : parsed.data.contact.replace(/[\s()-]/g, "");
    if (parsed.data.channel === "EMAIL" && !z.string().email().safeParse(contact).success) {
      return apiError(400, "INVALID_CONTACT", "Enter a valid email address");
    }
    if (parsed.data.channel === "SMS" && !/^\+[1-9]\d{7,14}$/.test(contact)) {
      return apiError(400, "INVALID_CONTACT", "Enter a phone number in international format");
    }
    const capabilities = await subscriptionCapabilities();
    const available = parsed.data.channel === "EMAIL" ? capabilities.email : capabilities.sms;
    if (!available.enabled) return apiError(503, "CHANNEL_UNAVAILABLE", available.reason ?? "Delivery channel unavailable");
    await Promise.all([
      consumeRateLimit(`subscription-ip:${parsed.data.pageSlug}`, requestIp(request), { limit: 10, windowMs: 60 * 60_000 }),
      consumeRateLimit(`subscription-contact:${parsed.data.pageSlug}:${parsed.data.channel}`, contact, { limit: 5, windowMs: 60 * 60_000 }),
    ]);

    const page = await getPublicPageBySlug(parsed.data.pageSlug);
    if (!page) return apiError(404, "PAGE_NOT_FOUND", "Page not found");
    const pageAccess = await checkPageAccess(page);
    if (!pageAccess.ok) return apiError(404, "PAGE_NOT_FOUND", "Page not found");
    const componentIds = [...new Set(parsed.data.componentIds)];
    if (componentIds.some((id) => !isDatabaseId(id))) {
      return apiError(400, "INVALID_COMPONENT_SCOPE", "One or more components are unavailable");
    }
    if (componentIds.length) {
      const components = await database.selectFrom("components").select("id")
        .where("id", "in", componentIds).where("pageId", "=", page.id).where("visible", "=", true).execute();
      if (components.length !== componentIds.length ||
        (pageAccess.visibleComponentIds && componentIds.some((id) => !pageAccess.visibleComponentIds!.includes(id)))) {
        return apiError(400, "INVALID_COMPONENT_SCOPE", "One or more components are unavailable");
      }
    }
    const effectiveComponentIds = componentIds.length ? componentIds : pageAccess.visibleComponentIds ?? [];
    const code = generateOtpCode();
    await withDatabaseTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(page.orgId, transaction);
      const currentPage = await transaction.selectFrom("pages").select(["id", "name"])
        .where("id", "=", page.id).where("orgId", "=", page.orgId).where("slug", "=", parsed.data.pageSlug)
        .where("deletedAt", "is", null).where("publicVisible", "=", true).forShare().executeTakeFirst();
      if (!currentPage) throw new Error("Page is no longer available");
      await transaction.deleteFrom("subscriptionOtps").where("pageId", "=", currentPage.id)
        .where("channel", "=", parsed.data.channel).where("contact", "=", contact).execute();
      const otp = await transaction.insertInto("subscriptionOtps").values({
        pageId: currentPage.id,
        channel: parsed.data.channel,
        contact,
        codeHash: hashSecret(code),
        componentIds: effectiveComponentIds,
        attempts: 0,
        expiresAt: new Date(Date.now() + 10 * 60_000),
        createdAt: new Date(),
      }).returning("id").executeTakeFirstOrThrow();
      await enqueueDirectNotification({
        pageId: currentPage.id,
        contact,
        subject: `${currentPage.name} verification code`,
        body: `${currentPage.name} verification code: ${code}. It expires in 10 minutes.`,
        eventType: "subscription.otp",
        eventId: otp.id,
        channel: parsed.data.channel,
      }, transaction);
    });
    return NextResponse.json({ ok: true, ...(process.env.STATUS_EXPOSE_OTP === "true" ? { devCode: code } : {}) });
  } catch (error) {
    if (error instanceof RateLimitError) {
      const response = apiError(429, "RATE_LIMITED", "Too many verification requests. Try again later.");
      response.headers.set("retry-after", String(error.retryAfterSeconds));
      return response;
    }
    return routeError(error, { route: "POST /api/v1/subscribe/request-otp" });
  }
}

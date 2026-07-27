import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkPageAccess } from "@/lib/access";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { collections } from "@/lib/db";
import { canonicalizeEmail } from "@/lib/identity";
import { toId } from "@/lib/mongo-utils";
import { enqueueDirectNotification, generateOtpCode } from "@/lib/notify";
import { consumeRateLimit, RateLimitError, requestIp } from "@/lib/rate-limit";
import { hashSecret } from "@/lib/secrets";
import { subscriptionCapabilities } from "@/lib/notification-capabilities";
import { withTransaction } from "@/lib/cascade";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { publicPageFilter } from "@/lib/page-lifecycle";

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
    const contact =
      parsed.data.channel === "EMAIL"
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
    if (!available.enabled) {
      return apiError(503, "CHANNEL_UNAVAILABLE", available.reason ?? "Delivery channel unavailable");
    }
    await Promise.all([
      consumeRateLimit(`subscription-ip:${parsed.data.pageSlug}`, requestIp(request), {
        limit: 10,
        windowMs: 60 * 60_000,
      }),
      consumeRateLimit(`subscription-contact:${parsed.data.pageSlug}:${parsed.data.channel}`, contact, {
        limit: 5,
        windowMs: 60 * 60_000,
      }),
    ]);

    const page = await collections.pages().findOne(publicPageFilter({ slug: parsed.data.pageSlug }));
    if (!page) return apiError(404, "PAGE_NOT_FOUND", "Page not found");
    const pageAccess = await checkPageAccess(toId(page));
    if (!pageAccess.ok) return apiError(404, "PAGE_NOT_FOUND", "Page not found");
    const uniqueComponentIds = [...new Set(parsed.data.componentIds)];
    const componentObjectIds = uniqueComponentIds.map((id) => {
      if (!ObjectId.isValid(id)) throw new Error("Invalid component scope");
      return new ObjectId(id);
    });
    if (componentObjectIds.length) {
      const components = await collections.components().find({
        _id: { $in: componentObjectIds },
        pageId: page._id,
        visible: true,
      }).toArray();
      if (components.length !== componentObjectIds.length) {
        return apiError(400, "INVALID_COMPONENT_SCOPE", "One or more components are unavailable");
      }
      if (
        pageAccess.visibleComponentIds &&
        uniqueComponentIds.some((id) => !pageAccess.visibleComponentIds!.includes(id))
      ) {
        return apiError(400, "INVALID_COMPONENT_SCOPE", "One or more components are unavailable");
      }
    }

    const effectiveComponentIds =
      uniqueComponentIds.length > 0
        ? uniqueComponentIds
        : pageAccess.visibleComponentIds ?? [];
    const code = generateOtpCode();
    const otpId = new ObjectId();
    await withTransaction(async (databaseSession) => {
      await fenceActiveOrganizationMutation(page.orgId, databaseSession);
      const currentPage = await collections.pages().findOne(
        publicPageFilter({ _id: page._id, orgId: page.orgId, slug: parsed.data.pageSlug }),
        { session: databaseSession }
      );
      if (!currentPage) throw new Error("Page is no longer available");
      await collections.subscriptionOtps().deleteMany(
        {
          pageId: currentPage._id.toHexString(),
          channel: parsed.data.channel,
          contact,
        },
        { session: databaseSession }
      );
      await collections.subscriptionOtps().insertOne({
        _id: otpId,
        pageId: currentPage._id.toHexString(),
        channel: parsed.data.channel,
        contact,
        codeHash: hashSecret(code),
        componentIds: JSON.stringify(effectiveComponentIds),
        attempts: 0,
        expiresAt: new Date(Date.now() + 10 * 60_000),
        createdAt: new Date(),
      }, { session: databaseSession });
      await enqueueDirectNotification({
        pageId: currentPage._id.toHexString(),
        contact,
        subject: `${currentPage.name} verification code`,
        body: `${currentPage.name} verification code: ${code}. It expires in 10 minutes.`,
        eventType: "subscription.otp",
        eventId: otpId.toHexString(),
        channel: parsed.data.channel,
      }, databaseSession);
    });
    return NextResponse.json({
      ok: true,
      ...(process.env.STATUS_EXPOSE_OTP === "true" ? { devCode: code } : {}),
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      const response = apiError(429, "RATE_LIMITED", "Too many verification requests. Try again later.");
      response.headers.set("retry-after", String(error.retryAfterSeconds));
      return response;
    }
    return routeError(error);
  }
}

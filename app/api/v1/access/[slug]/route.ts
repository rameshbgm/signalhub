import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPageAccessSession, verifyPassword } from "@/lib/auth";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { collections } from "@/lib/db";
import { canonicalizeEmail } from "@/lib/identity";
import { toId } from "@/lib/mongo-utils";
import { consumeRateLimit, RateLimitError, requestIp } from "@/lib/rate-limit";
import { isPageOrganizationActive } from "@/lib/public-page";
import { publicPageFilter } from "@/lib/page-lifecycle";

const schema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(1).max(1024),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    await consumeRateLimit(`page-access:${slug}`, requestIp(request), {
      limit: 10,
      windowMs: 15 * 60_000,
    });

    const pageDoc = await collections.pages().findOne(publicPageFilter({ slug }));
    if (!pageDoc) return apiError(404, "PAGE_NOT_FOUND", "Page not found");
    if (!(await isPageOrganizationActive(pageDoc.orgId))) {
      return apiError(404, "PAGE_NOT_FOUND", "Page not found");
    }
    const page = toId(pageDoc);
    if (page.type === "PRIVATE") {
      if (!page.passwordHash || !(await verifyPassword(parsed.data.password, page.passwordHash))) {
        return apiError(401, "ACCESS_DENIED", "Incorrect password");
      }
      await createPageAccessSession(page.id, {});
      return NextResponse.json({ ok: true });
    }
    if (page.type === "AUDIENCE") {
      if (!parsed.data.email) return apiError(400, "EMAIL_REQUIRED", "Email is required");
      const email = canonicalizeEmail(parsed.data.email);
      const userDoc = await collections.pageAccessUsers().findOne({ pageId: pageDoc._id, email });
      if (!userDoc || !(await verifyPassword(parsed.data.password, userDoc.passwordHash))) {
        return apiError(401, "ACCESS_DENIED", "Invalid email or password");
      }
      const user = toId(userDoc);
      await createPageAccessSession(page.id, { userId: user.id, email: user.email });
      return NextResponse.json({ ok: true });
    }
    return apiError(400, "ACCESS_NOT_REQUIRED", "This page does not require access control");
  } catch (error) {
    if (error instanceof RateLimitError) {
      const response = apiError(429, "RATE_LIMITED", "Too many access attempts. Try again later.");
      response.headers.set("retry-after", String(error.retryAfterSeconds));
      return response;
    }
    return routeError(error);
  }
}

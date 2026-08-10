import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPageAccessSession, verifyPassword } from "@/lib/auth";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { canonicalizeEmail } from "@/lib/identity";
import { consumeRateLimit, RateLimitError, requestIp } from "@/lib/rate-limit";
import { isPageOrganizationActive } from "@/lib/public-page";
import { getPublicPageBySlug } from "@/lib/pages";
import { database } from "@/lib/postgres/client";

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

    const page = await getPublicPageBySlug(slug);
    if (!page) return apiError(404, "PAGE_NOT_FOUND", "Page not found");
    if (!(await isPageOrganizationActive(page.orgId))) {
      return apiError(404, "PAGE_NOT_FOUND", "Page not found");
    }
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
      const user = await database
        .selectFrom("pageAccessUsers")
        .selectAll()
        .where("pageId", "=", page.id)
        .where("email", "=", email)
        .executeTakeFirst();
      if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
        return apiError(401, "ACCESS_DENIED", "Invalid email or password");
      }
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

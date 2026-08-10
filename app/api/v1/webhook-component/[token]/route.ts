import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/postgres/client";
import { COMPONENT_STATUSES } from "@/lib/status";
import { setComponentStatus } from "@/lib/component-status";
import { z } from "zod";
import { hashSecret } from "@/lib/secrets";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { consumeRateLimit, RateLimitError, requestIp } from "@/lib/rate-limit";

/**
 * Per-component automation endpoint (token in the URL is the credential).
 * Any monitoring/alerting tool that can fire an HTTP request can flip a
 * component's status without a human in the loop, e.g.:
 *   curl -X POST /api/v1/webhook-component/<token> -d '{"status":"MAJOR_OUTAGE"}'
 * This stands in for the "unique inbound email address per component" flow
 * described in the spec, adapted to a webhook since this build has no inbound
 * email/SMTP receiver.
 */
const schema = z.object({ status: z.enum(COMPONENT_STATUSES) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    await consumeRateLimit("automation", requestIp(req), { limit: 120, windowMs: 60_000 });
    const { token } = await params;
    const component = await database.selectFrom("components as component")
      .innerJoin("pages as page", "page.id", "component.pageId")
      .innerJoin("organizations as organization", "organization.id", "page.orgId")
      .select(["component.id", "component.name"])
      .where("component.automationTokenHash", "=", hashSecret(token))
      .where("page.deletedAt", "is", null).where("organization.status", "=", "ACTIVE")
      .where("organization.suspended", "=", false).executeTakeFirst();
    if (!component) return apiError(404, "INVALID_AUTOMATION_TOKEN", "Invalid automation token");
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    await setComponentStatus(component.id, parsed.data.status, { isMaintenance: false });
    return NextResponse.json({ ok: true, component: component.name, status: parsed.data.status });
  } catch (error) {
    if (error instanceof RateLimitError) {
      const response = apiError(429, "RATE_LIMITED", "Too many automation requests");
      response.headers.set("retry-after", String(error.retryAfterSeconds));
      return response;
    }
    return routeError(error, { route: "POST /api/v1/webhook-component/:token" });
  }
}

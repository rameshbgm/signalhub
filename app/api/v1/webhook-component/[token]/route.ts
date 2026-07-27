import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/lib/db";
import { toId } from "@/lib/mongo-utils";
import { COMPONENT_STATUSES } from "@/lib/status";
import { setComponentStatus } from "@/lib/component-status";
import { z } from "zod";
import { hashSecret } from "@/lib/secrets";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { consumeRateLimit, RateLimitError, requestIp } from "@/lib/rate-limit";
import { organizationIsActive } from "@/lib/organization-state";
import { activePageFilter } from "@/lib/page-lifecycle";

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
    const componentDoc = await collections.components().findOne({ automationTokenHash: hashSecret(token) });
    if (!componentDoc) return apiError(404, "INVALID_AUTOMATION_TOKEN", "Invalid automation token");
    const page = await collections.pages().findOne(activePageFilter({ _id: componentDoc.pageId }));
    const organization = page
      ? await collections.organizations().findOne({ _id: page.orgId })
      : null;
    if (!page || !organization || !organizationIsActive(organization)) {
      return apiError(403, "ORGANIZATION_INACTIVE", "This organization is not active");
    }
    const component = toId(componentDoc);
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    await setComponentStatus(componentDoc._id, parsed.data.status, { isMaintenance: false });
    return NextResponse.json({ ok: true, component: component.name, status: parsed.data.status });
  } catch (error) {
    if (error instanceof RateLimitError) {
      const response = apiError(429, "RATE_LIMITED", "Too many automation requests");
      response.headers.set("retry-after", String(error.retryAfterSeconds));
      return response;
    }
    return routeError(error);
  }
}

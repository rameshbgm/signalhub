import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { COMPONENT_STATUSES } from "@/lib/status";
import { z } from "zod";

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
  const { token } = await params;
  const component = await prisma.component.findUnique({ where: { automationToken: token } });
  if (!component) return NextResponse.json({ error: "Invalid automation token" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  if (component.status !== parsed.data.status) {
    await prisma.componentStatusEvent.updateMany({ where: { componentId: component.id, endedAt: null }, data: { endedAt: new Date() } });
    await prisma.componentStatusEvent.create({ data: { componentId: component.id, status: parsed.data.status } });
  }

  await prisma.component.update({ where: { id: component.id }, data: { status: parsed.data.status } });
  return NextResponse.json({ ok: true, component: component.name, status: parsed.data.status });
}

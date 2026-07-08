import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { toId } from "@/lib/mongo-utils";
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
  const componentDoc = await collections.components().findOne({ automationToken: token });
  if (!componentDoc) return NextResponse.json({ error: "Invalid automation token" }, { status: 404 });
  const component = toId(componentDoc);

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  if (component.status !== parsed.data.status) {
    await collections.componentStatusEvents().updateMany(
      { componentId: componentDoc._id, endedAt: null },
      { $set: { endedAt: new Date() } }
    );
    await collections.componentStatusEvents().insertOne({
      _id: new ObjectId(),
      componentId: componentDoc._id,
      status: parsed.data.status,
      startedAt: new Date(),
      endedAt: null,
      isMaintenance: false,
    });
  }

  await collections.components().updateOne({ _id: componentDoc._id }, { $set: { status: parsed.data.status } });
  return NextResponse.json({ ok: true, component: component.name, status: parsed.data.status });
}

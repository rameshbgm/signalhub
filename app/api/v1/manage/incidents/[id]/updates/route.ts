import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { authenticateApiKey } from "@/lib/api-auth";
import { dispatchNotifications } from "@/lib/notify";
import { z } from "zod";

const schema = z.object({
  status: z.enum(["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"]),
  body: z.string().min(1),
  notify: z.boolean().default(true),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const apiKey = await authenticateApiKey(req);
  if (!apiKey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const incidentDoc = await collections.incidents().findOne({ _id: oid(id) });
  if (!incidentDoc) return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  const pageDoc = await collections.pages().findOne({ _id: incidentDoc.pageId });
  if (!pageDoc || pageDoc.orgId.toHexString() !== apiKey.orgId) return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  const linkedComponents = await collections.incidentComponents().find({ incidentId: oid(id) }).toArray();

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { status, body, notify } = parsed.data;

  const updateDoc = {
    _id: new ObjectId(),
    incidentId: oid(id),
    status,
    body,
    createdAt: new Date(),
    notified: notify,
  };
  await collections.incidentUpdates().insertOne(updateDoc);
  await collections.incidents().updateOne(
    { _id: oid(id) },
    { $set: { status, resolvedAt: status === "RESOLVED" ? new Date() : null } }
  );

  if (status === "RESOLVED") {
    for (const ic of linkedComponents) {
      await collections.components().updateOne({ _id: ic.componentId }, { $set: { status: "OPERATIONAL" } });
    }
  }

  if (notify) {
    await dispatchNotifications({
      pageId: incidentDoc.pageId.toHexString(),
      subject: `[${status}] ${incidentDoc.name}`,
      body,
      eventType: "incident.updated",
      componentIds: linkedComponents.map((c) => c.componentId.toHexString()),
    });
  }

  return NextResponse.json({ update: toId(updateDoc) }, { status: 201 });
}

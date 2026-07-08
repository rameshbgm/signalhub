import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { authenticateApiKey } from "@/lib/api-auth";
import { COMPONENT_STATUSES } from "@/lib/status";
import { z } from "zod";

const schema = z.object({ status: z.enum(COMPONENT_STATUSES) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const apiKey = await authenticateApiKey(req);
  if (!apiKey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const componentDoc = await collections.components().findOne({ _id: oid(id) });
  if (!componentDoc) return NextResponse.json({ error: "Component not found" }, { status: 404 });
  const pageDoc = await collections.pages().findOne({ _id: componentDoc.pageId });
  if (!pageDoc || pageDoc.orgId.toHexString() !== apiKey.orgId) return NextResponse.json({ error: "Component not found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  if (componentDoc.status !== parsed.data.status) {
    await collections.componentStatusEvents().updateMany(
      { componentId: oid(id), endedAt: null },
      { $set: { endedAt: new Date() } }
    );
    await collections.componentStatusEvents().insertOne({
      _id: new ObjectId(),
      componentId: oid(id),
      status: parsed.data.status,
      startedAt: new Date(),
      endedAt: null,
      isMaintenance: false,
    });
  }

  await collections.components().updateOne({ _id: oid(id) }, { $set: { status: parsed.data.status } });
  const updated = await collections.components().findOne({ _id: oid(id) });
  return NextResponse.json({ component: toId(updated!) });
}

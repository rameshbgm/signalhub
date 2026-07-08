import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { authenticateApiKey } from "@/lib/api-auth";
import { z } from "zod";

const schema = z.object({ value: z.number(), timestamp: z.string().datetime().optional() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const apiKey = await authenticateApiKey(req);
  if (!apiKey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const metricDoc = await collections.metrics().findOne({ _id: oid(id) });
  if (!metricDoc) return NextResponse.json({ error: "Metric not found" }, { status: 404 });
  const pageDoc = await collections.pages().findOne({ _id: metricDoc.pageId });
  if (!pageDoc || pageDoc.orgId.toHexString() !== apiKey.orgId) return NextResponse.json({ error: "Metric not found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const point = {
    _id: new ObjectId(),
    metricId: oid(id),
    value: parsed.data.value,
    timestamp: parsed.data.timestamp ? new Date(parsed.data.timestamp) : new Date(),
  };
  await collections.metricPoints().insertOne(point);
  return NextResponse.json({ point: { ...point, id: point._id.toHexString(), metricId: id } }, { status: 201 });
}

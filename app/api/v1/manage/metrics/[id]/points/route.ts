import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-auth";
import { z } from "zod";

const schema = z.object({ value: z.number(), timestamp: z.string().datetime().optional() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const apiKey = await authenticateApiKey(req);
  if (!apiKey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const metric = await prisma.metric.findUnique({ where: { id }, include: { page: true } });
  if (!metric || metric.page.orgId !== apiKey.orgId) return NextResponse.json({ error: "Metric not found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const point = await prisma.metricPoint.create({
    data: { metricId: id, value: parsed.data.value, timestamp: parsed.data.timestamp ? new Date(parsed.data.timestamp) : undefined },
  });
  return NextResponse.json({ point }, { status: 201 });
}

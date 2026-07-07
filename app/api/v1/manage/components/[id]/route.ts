import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-auth";
import { COMPONENT_STATUSES } from "@/lib/status";
import { z } from "zod";

const schema = z.object({ status: z.enum(COMPONENT_STATUSES) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const apiKey = await authenticateApiKey(req);
  if (!apiKey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const component = await prisma.component.findUnique({ where: { id }, include: { page: true } });
  if (!component || component.page.orgId !== apiKey.orgId) return NextResponse.json({ error: "Component not found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  if (component.status !== parsed.data.status) {
    await prisma.componentStatusEvent.updateMany({ where: { componentId: id, endedAt: null }, data: { endedAt: new Date() } });
    await prisma.componentStatusEvent.create({ data: { componentId: id, status: parsed.data.status } });
  }

  const updated = await prisma.component.update({ where: { id }, data: { status: parsed.data.status } });
  return NextResponse.json({ component: updated });
}

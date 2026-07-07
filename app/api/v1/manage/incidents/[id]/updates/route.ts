import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
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
  const incident = await prisma.incident.findUnique({ where: { id }, include: { components: true, page: true } });
  if (!incident || incident.page.orgId !== apiKey.orgId) return NextResponse.json({ error: "Incident not found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { status, body, notify } = parsed.data;

  const update = await prisma.incidentUpdate.create({ data: { incidentId: id, status, body, notified: notify } });
  await prisma.incident.update({ where: { id }, data: { status, resolvedAt: status === "RESOLVED" ? new Date() : null } });

  if (status === "RESOLVED") {
    for (const ic of incident.components) {
      await prisma.component.update({ where: { id: ic.componentId }, data: { status: "OPERATIONAL" } });
    }
  }

  if (notify) {
    await dispatchNotifications({
      pageId: incident.pageId,
      subject: `[${status}] ${incident.name}`,
      body,
      eventType: "incident.updated",
      componentIds: incident.components.map((c) => c.componentId),
    });
  }

  return NextResponse.json({ update }, { status: 201 });
}

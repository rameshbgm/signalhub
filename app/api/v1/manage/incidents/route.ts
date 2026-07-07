import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-auth";
import { dispatchNotifications } from "@/lib/notify";
import { z } from "zod";

const schema = z.object({
  pageId: z.string(),
  name: z.string().min(1),
  status: z.enum(["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"]).default("INVESTIGATING"),
  impact: z.enum(["NONE", "MINOR", "MAJOR", "CRITICAL"]).default("MINOR"),
  body: z.string().default(""),
  notify: z.boolean().default(true),
  components: z.array(z.object({ componentId: z.string(), status: z.string() })).default([]),
});

export async function GET(req: NextRequest) {
  const apiKey = await authenticateApiKey(req);
  if (!apiKey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pageId = req.nextUrl.searchParams.get("pageId");
  const pages = await prisma.page.findMany({ where: { orgId: apiKey.orgId, ...(pageId ? { id: pageId } : {}) } });
  const incidents = await prisma.incident.findMany({
    where: { pageId: { in: pages.map((p) => p.id) } },
    orderBy: { createdAt: "desc" },
    include: { updates: true, components: true },
    take: 100,
  });
  return NextResponse.json({ incidents });
}

export async function POST(req: NextRequest) {
  const apiKey = await authenticateApiKey(req);
  if (!apiKey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { pageId, name, status, impact, body, notify, components } = parsed.data;

  const page = await prisma.page.findUnique({ where: { id: pageId } });
  if (!page || page.orgId !== apiKey.orgId) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const incident = await prisma.incident.create({
    data: {
      pageId,
      name,
      status,
      impact,
      resolvedAt: status === "RESOLVED" ? new Date() : null,
      components: { create: components.map((c) => ({ componentId: c.componentId, newStatus: c.status })) },
      updates: { create: [{ status, body: body || `Incident created: ${name}`, notified: notify }] },
    },
    include: { components: true },
  });

  for (const c of components) {
    await prisma.componentStatusEvent.updateMany({ where: { componentId: c.componentId, endedAt: null }, data: { endedAt: new Date() } });
    await prisma.componentStatusEvent.create({ data: { componentId: c.componentId, status: c.status } });
    await prisma.component.update({ where: { id: c.componentId }, data: { status: c.status } });
  }

  if (notify) {
    await dispatchNotifications({
      pageId,
      subject: `[Incident] ${name}`,
      body: body || `A new incident has been created: ${name}`,
      eventType: "incident.created",
      componentIds: components.map((c) => c.componentId),
    });
  }

  return NextResponse.json({ incident }, { status: 201 });
}

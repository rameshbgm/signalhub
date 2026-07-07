import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { overallBanner, type ComponentStatus } from "@/lib/status";
import { syncAutoMaintenance } from "@/lib/maintenance-sync";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await syncAutoMaintenance();

  const page = await prisma.page.findUnique({ where: { slug } });
  if (!page || page.type !== "PUBLIC") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const components = await prisma.component.findMany({ where: { pageId: page.id, visible: true }, orderBy: { order: "asc" } });
  const banner = overallBanner(components.map((c) => c.status as ComponentStatus));

  const activeIncidents = await prisma.incident.findMany({
    where: { pageId: page.id, isMaintenance: false, status: { not: "RESOLVED" } },
    include: { updates: { orderBy: { createdAt: "desc" }, take: 1 }, components: { include: { component: true } } },
  });

  const upcomingMaintenance = await prisma.incident.findMany({
    where: { pageId: page.id, isMaintenance: true, maintenanceStatus: { not: "COMPLETED" } },
    include: { components: { include: { component: true } } },
  });

  return NextResponse.json({
    page: { name: page.name, slug: page.slug, url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/${page.slug}` },
    status: { indicator: banner.status, description: banner.label },
    components: components.map((c) => ({ id: c.id, name: c.name, status: c.status })),
    active_incidents: activeIncidents.map((i) => ({
      id: i.id,
      name: i.name,
      status: i.status,
      impact: i.impact,
      created_at: i.createdAt,
      latest_update: i.updates[0]?.body ?? null,
      affected_components: i.components.map((c) => c.component.name),
    })),
    scheduled_maintenance: upcomingMaintenance.map((m) => ({
      id: m.id,
      name: m.name,
      status: m.maintenanceStatus,
      scheduled_start: m.scheduledStart,
      scheduled_end: m.scheduledEnd,
      affected_components: m.components.map((c) => c.component.name),
    })),
  });
}

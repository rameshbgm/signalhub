import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/lib/db";
import { toId } from "@/lib/mongo-utils";
import { overallBanner, type ComponentStatus } from "@/lib/status";
import { syncAutoMaintenance } from "@/lib/maintenance-sync";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await syncAutoMaintenance();

  const pageDoc = await collections.pages().findOne({ slug });
  if (!pageDoc || pageDoc.type !== "PUBLIC") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const page = toId(pageDoc);

  const components = (
    await collections.components().find({ pageId: pageDoc._id, visible: true }).sort({ order: 1 }).toArray()
  ).map(toId);
  const banner = overallBanner(components.map((c) => c.status as ComponentStatus));

  const activeIncidentDocs = await collections
    .incidents()
    .find({ pageId: pageDoc._id, isMaintenance: false, status: { $ne: "RESOLVED" } })
    .toArray();
  const upcomingMaintenanceDocs = await collections
    .incidents()
    .find({ pageId: pageDoc._id, isMaintenance: true, maintenanceStatus: { $ne: "COMPLETED" } })
    .toArray();

  const allIncidentIds = [...activeIncidentDocs, ...upcomingMaintenanceDocs].map((i) => i._id);
  const linkDocs = allIncidentIds.length
    ? await collections.incidentComponents().find({ incidentId: { $in: allIncidentIds } }).toArray()
    : [];
  const linkedComponentIds = [...new Map(linkDocs.map((l) => [l.componentId.toHexString(), l.componentId])).values()];
  const componentDocs = linkedComponentIds.length
    ? await collections.components().find({ _id: { $in: linkedComponentIds } }).toArray()
    : [];
  const componentNameById = new Map(componentDocs.map((c) => [c._id.toHexString(), c.name]));
  const linksByIncident = new Map<string, typeof linkDocs>();
  for (const l of linkDocs) {
    const key = l.incidentId.toHexString();
    if (!linksByIncident.has(key)) linksByIncident.set(key, []);
    linksByIncident.get(key)!.push(l);
  }

  const latestUpdateByIncident = new Map<string, string | null>();
  for (const inc of activeIncidentDocs) {
    const latest = await collections.incidentUpdates().find({ incidentId: inc._id }).sort({ createdAt: -1 }).limit(1).next();
    latestUpdateByIncident.set(inc._id.toHexString(), latest?.body ?? null);
  }

  return NextResponse.json({
    page: { name: page.name, slug: page.slug, url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/${page.slug}` },
    status: { indicator: banner.status, description: banner.label },
    components: components.map((c) => ({ id: c.id, name: c.name, status: c.status })),
    active_incidents: activeIncidentDocs.map((i) => ({
      id: i._id.toHexString(),
      name: i.name,
      status: i.status,
      impact: i.impact,
      created_at: i.createdAt,
      latest_update: latestUpdateByIncident.get(i._id.toHexString()) ?? null,
      affected_components: (linksByIncident.get(i._id.toHexString()) ?? []).map(
        (l) => componentNameById.get(l.componentId.toHexString()) ?? ""
      ),
    })),
    scheduled_maintenance: upcomingMaintenanceDocs.map((m) => ({
      id: m._id.toHexString(),
      name: m.name,
      status: m.maintenanceStatus,
      scheduled_start: m.scheduledStart,
      scheduled_end: m.scheduledEnd,
      affected_components: (linksByIncident.get(m._id.toHexString()) ?? []).map(
        (l) => componentNameById.get(l.componentId.toHexString()) ?? ""
      ),
    })),
  });
}

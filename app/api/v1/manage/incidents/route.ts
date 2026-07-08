import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
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
  const pages = await collections
    .pages()
    .find({ orgId: oid(apiKey.orgId), ...(pageId ? { _id: oid(pageId) } : {}) })
    .toArray();
  const incidentDocs = await collections
    .incidents()
    .find({ pageId: { $in: pages.map((p) => p._id) } })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();
  const incidentIds = incidentDocs.map((i) => i._id);
  const [updateDocs, linkDocs] = await Promise.all([
    incidentIds.length ? collections.incidentUpdates().find({ incidentId: { $in: incidentIds } }).toArray() : Promise.resolve([]),
    incidentIds.length ? collections.incidentComponents().find({ incidentId: { $in: incidentIds } }).toArray() : Promise.resolve([]),
  ]);
  const updatesByIncident = new Map<string, typeof updateDocs>();
  for (const u of updateDocs) {
    const key = u.incidentId.toHexString();
    if (!updatesByIncident.has(key)) updatesByIncident.set(key, []);
    updatesByIncident.get(key)!.push(u);
  }
  const linksByIncident = new Map<string, typeof linkDocs>();
  for (const l of linkDocs) {
    const key = l.incidentId.toHexString();
    if (!linksByIncident.has(key)) linksByIncident.set(key, []);
    linksByIncident.get(key)!.push(l);
  }
  const incidents = incidentDocs.map((inc) => ({
    ...toId(inc),
    updates: (updatesByIncident.get(inc._id.toHexString()) ?? []).map(toId),
    components: (linksByIncident.get(inc._id.toHexString()) ?? []).map(toId),
  }));

  return NextResponse.json({ incidents });
}

export async function POST(req: NextRequest) {
  const apiKey = await authenticateApiKey(req);
  if (!apiKey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { pageId, name, status, impact, body, notify, components } = parsed.data;

  const pageDoc = await collections.pages().findOne({ _id: oid(pageId) });
  if (!pageDoc || pageDoc.orgId.toHexString() !== apiKey.orgId) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const incidentId = new ObjectId();
  await collections.incidents().insertOne({
    _id: incidentId,
    pageId: oid(pageId),
    name,
    status,
    impact,
    isMaintenance: false,
    maintenanceStatus: null,
    scheduledStart: null,
    scheduledEnd: null,
    autoTransition: false,
    notifySubscribers: notify,
    postmortemBody: null,
    postmortemPublishedAt: null,
    createdAt: new Date(),
    resolvedAt: status === "RESOLVED" ? new Date() : null,
    backfilled: false,
  });
  const linkDocs = components.map((c) => ({
    _id: new ObjectId(),
    incidentId,
    componentId: oid(c.componentId),
    newStatus: c.status,
  }));
  if (linkDocs.length) await collections.incidentComponents().insertMany(linkDocs);
  await collections.incidentUpdates().insertOne({
    _id: new ObjectId(),
    incidentId,
    status,
    body: body || `Incident created: ${name}`,
    createdAt: new Date(),
    notified: notify,
  });

  for (const c of components) {
    await collections.componentStatusEvents().updateMany(
      { componentId: oid(c.componentId), endedAt: null },
      { $set: { endedAt: new Date() } }
    );
    await collections.componentStatusEvents().insertOne({
      _id: new ObjectId(),
      componentId: oid(c.componentId),
      status: c.status,
      startedAt: new Date(),
      endedAt: null,
      isMaintenance: false,
    });
    await collections.components().updateOne({ _id: oid(c.componentId) }, { $set: { status: c.status } });
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

  const incidentDoc = await collections.incidents().findOne({ _id: incidentId });
  return NextResponse.json(
    { incident: { ...toId(incidentDoc!), components: linkDocs.map(toId) } },
    { status: 201 }
  );
}

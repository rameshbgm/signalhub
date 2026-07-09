import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { collections, mongoClient } from "@/lib/db";

function daysAgo(n: number, hour = 12) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const minutes = Math.round((hour % 1) * 60);
  d.setHours(Math.floor(hour), minutes, 0, 0);
  return d;
}

async function main() {
  console.log("Seeding Globex organization + page...");
  await collections.organizations().updateOne(
    { slug: "globex" },
    { $setOnInsert: { name: "Globex Corporation", slug: "globex", plan: "enterprise", createdAt: new Date() } },
    { upsert: true }
  );
  const org = (await collections.organizations().findOne({ slug: "globex" }))!;

  const passwordHash = await bcrypt.hash("password123", 10);
  // Old 4-role seed accounts (OWNER/ADMIN/EDITOR/RESPONDER) collapsed to 2 under the 3-role model.
  await collections.teamMembers().deleteMany({ orgId: org._id, email: { $in: ["admin2@globex.test", "responder@globex.test"] } });
  await collections.teamMembers().updateOne(
    { orgId: org._id, email: "admin@globex.test" },
    {
      $set: { role: "TENANT_ADMIN" },
      $setOnInsert: { orgId: org._id, email: "admin@globex.test", passwordHash, name: "Hank Scorpio", twoFactorEnabled: false, createdAt: new Date() },
    },
    { upsert: true }
  );
  await collections.teamMembers().updateOne(
    { orgId: org._id, email: "editor@globex.test" },
    {
      $set: { role: "TENANT_USER" },
      $setOnInsert: { orgId: org._id, email: "editor@globex.test", passwordHash, name: "Edie Editor", twoFactorEnabled: false, createdAt: new Date() },
    },
    { upsert: true }
  );

  const existing = await collections.pages().findOne({ slug: "globex" });
  if (existing) {
    const oldPageId = existing._id;
    const oldComponentIds = (await collections.components().find({ pageId: oldPageId }).toArray()).map((c) => c._id);
    const oldIncidentIds = (await collections.incidents().find({ pageId: oldPageId }).toArray()).map((i) => i._id);
    const oldMetricIds = (await collections.metrics().find({ pageId: oldPageId }).toArray()).map((m) => m._id);
    await collections.componentStatusEvents().deleteMany({ componentId: { $in: oldComponentIds } });
    await collections.incidentComponents().deleteMany({ incidentId: { $in: oldIncidentIds } });
    await collections.incidentUpdates().deleteMany({ incidentId: { $in: oldIncidentIds } });
    await collections.metricPoints().deleteMany({ metricId: { $in: oldMetricIds } });
    await collections.components().deleteMany({ pageId: oldPageId });
    await collections.componentGroups().deleteMany({ pageId: oldPageId });
    await collections.incidents().deleteMany({ pageId: oldPageId });
    await collections.metrics().deleteMany({ pageId: oldPageId });
    await collections.subscribers().deleteMany({ pageId: oldPageId });
    await collections.pages().deleteOne({ _id: oldPageId });
  }
  const _id = new ObjectId();
  await collections.pages().insertOne({
    _id,
    orgId: org._id,
    name: "Globex Status",
    slug: "globex",
    type: "PUBLIC",
    isHub: false,
    hubParentId: null,
    timezone: "UTC",
    language: "en",
    headline: "Globex Status",
    aboutText: "Real-time status and incident history for the Globex platform.",
    logoUrl: null,
    faviconUrl: null,
    brandColor: "#7C3AED",
    supportUrl: "https://globex.test/support",
    customDomain: null,
    passwordHash: null,
    removeBranding: false,
    customCss: null,
    layout: "COVER",
    coverImageUrl: null,
    createdAt: new Date(),
  });
  const page = (await collections.pages().findOne({ _id }))!;

  console.log("Seeding components...");
  async function createGroup(name: string, order: number) {
    const gid = new ObjectId();
    await collections.componentGroups().insertOne({ _id: gid, pageId: page._id, name, description: "", order, collapsed: false });
    return gid;
  }
  async function createComponent(data: {
    groupId?: ObjectId | null;
    name: string;
    status: string;
    order: number;
    isThirdParty?: boolean;
    thirdPartyProvider?: string | null;
  }) {
    const cid = new ObjectId();
    await collections.components().insertOne({
      _id: cid,
      pageId: page._id,
      groupId: data.groupId ?? null,
      name: data.name,
      description: "",
      status: data.status,
      order: data.order,
      visible: true,
      showUptime: true,
      isThirdParty: data.isThirdParty ?? false,
      thirdPartyProvider: data.thirdPartyProvider ?? null,
      automationToken: new ObjectId().toHexString(),
      createdAt: new Date(),
    });
    return cid;
  }

  const coreGroup = await createGroup("Core Platform", 0);
  const infraGroup = await createGroup("Infrastructure", 1);

  const api = await createComponent({ groupId: coreGroup, name: "Public API", status: "OPERATIONAL", order: 0 });
  const dashboard = await createComponent({ groupId: coreGroup, name: "Customer Dashboard", status: "OPERATIONAL", order: 1 });
  const billing = await createComponent({ groupId: coreGroup, name: "Billing", status: "DEGRADED_PERFORMANCE", order: 2 });
  const cdn = await createComponent({ groupId: infraGroup, name: "CDN", status: "OPERATIONAL", order: 0 });
  const db_ = await createComponent({ groupId: infraGroup, name: "Primary Database", status: "MAJOR_OUTAGE", order: 1 });
  const email = await createComponent({ name: "Email Delivery (SendGrid)", status: "OPERATIONAL", order: 2, isThirdParty: true, thirdPartyProvider: "SendGrid" });
  const search = await createComponent({ name: "Search", status: "UNDER_MAINTENANCE", order: 3 });

  console.log("Seeding 90-day uptime history...");
  async function seedHistory(componentId: ObjectId, dips: { start: number; end: number; status: string }[]) {
    await collections.componentStatusEvents().insertOne({
      _id: new ObjectId(), componentId, status: "OPERATIONAL", startedAt: daysAgo(95), endedAt: null, isMaintenance: false,
    });
    for (const dip of dips) {
      await collections.componentStatusEvents().insertOne({
        _id: new ObjectId(), componentId, status: dip.status, startedAt: daysAgo(dip.start), endedAt: daysAgo(dip.end), isMaintenance: dip.status === "UNDER_MAINTENANCE",
      });
    }
  }
  await seedHistory(api, [{ start: 40, end: 40, status: "DEGRADED_PERFORMANCE" }]);
  await seedHistory(dashboard, []);
  await seedHistory(billing, [{ start: 3, end: 2, status: "DEGRADED_PERFORMANCE" }, { start: 0, end: 0, status: "DEGRADED_PERFORMANCE" }]);
  await seedHistory(cdn, [{ start: 60, end: 60, status: "PARTIAL_OUTAGE" }]);
  await seedHistory(db_, [{ start: 20, end: 19, status: "MAJOR_OUTAGE" }, { start: 0, end: 0, status: "MAJOR_OUTAGE" }]);
  await seedHistory(email, []);
  await seedHistory(search, [{ start: 0, end: 0, status: "UNDER_MAINTENANCE" }]);

  console.log("Seeding incidents (active, resolved, maintenance)...");
  async function createIncident(data: {
    name: string;
    status: string;
    impact: string;
    isMaintenance?: boolean;
    maintenanceStatus?: string | null;
    scheduledStart?: Date | null;
    scheduledEnd?: Date | null;
    backfilled?: boolean;
    notifySubscribers?: boolean;
    createdAt: Date;
    resolvedAt?: Date | null;
    postmortemBody?: string | null;
    postmortemPublishedAt?: Date | null;
    components: { componentId: ObjectId; newStatus: string }[];
    updates: { status: string; body: string; createdAt: Date }[];
  }) {
    const iid = new ObjectId();
    await collections.incidents().insertOne({
      _id: iid,
      pageId: page._id,
      name: data.name,
      status: data.status,
      impact: data.impact,
      isMaintenance: data.isMaintenance ?? false,
      maintenanceStatus: data.maintenanceStatus ?? null,
      scheduledStart: data.scheduledStart ?? null,
      scheduledEnd: data.scheduledEnd ?? null,
      autoTransition: false,
      notifySubscribers: data.notifySubscribers ?? true,
      postmortemBody: data.postmortemBody ?? null,
      postmortemPublishedAt: data.postmortemPublishedAt ?? null,
      createdAt: data.createdAt,
      resolvedAt: data.resolvedAt ?? null,
      backfilled: data.backfilled ?? false,
    });
    if (data.components.length) {
      await collections.incidentComponents().insertMany(
        data.components.map((c) => ({ _id: new ObjectId(), incidentId: iid, componentId: c.componentId, newStatus: c.newStatus }))
      );
    }
    if (data.updates.length) {
      await collections.incidentUpdates().insertMany(
        data.updates.map((u) => ({ _id: new ObjectId(), incidentId: iid, status: u.status, body: u.body, createdAt: u.createdAt, notified: false }))
      );
    }
    return iid;
  }

  // Active major outage (in progress right now)
  await createIncident({
    name: "Primary database experiencing major outage",
    status: "IDENTIFIED",
    impact: "CRITICAL",
    createdAt: daysAgo(0, 8),
    components: [{ componentId: db_, newStatus: "MAJOR_OUTAGE" }],
    updates: [
      { status: "INVESTIGATING", body: "We are investigating a major outage affecting the primary database. All write operations are currently failing.", createdAt: daysAgo(0, 8) },
      { status: "IDENTIFIED", body: "We've identified a failed failover after a storage node crash. Engineers are manually promoting a replica.", createdAt: daysAgo(0, 8.5) },
    ],
  });

  // Active minor degradation
  await createIncident({
    name: "Billing dashboard showing stale data",
    status: "MONITORING",
    impact: "MINOR",
    createdAt: daysAgo(0, 6),
    components: [{ componentId: billing, newStatus: "DEGRADED_PERFORMANCE" }],
    updates: [
      { status: "INVESTIGATING", body: "Some customers are seeing stale invoice data on the billing dashboard.", createdAt: daysAgo(0, 6) },
      { status: "IDENTIFIED", body: "A caching layer is serving expired data after a deploy. Cache invalidation fix is being deployed.", createdAt: daysAgo(0, 6.5) },
      { status: "MONITORING", body: "The fix has been deployed. We're monitoring cache freshness before resolving.", createdAt: daysAgo(0, 7) },
    ],
  });

  // In-progress scheduled maintenance
  await createIncident({
    name: "Search index rebuild",
    status: "MONITORING",
    impact: "NONE",
    isMaintenance: true,
    maintenanceStatus: "IN_PROGRESS",
    scheduledStart: daysAgo(0, 2),
    scheduledEnd: daysAgo(-1, 2),
    createdAt: daysAgo(0, 2),
    components: [{ componentId: search, newStatus: "UNDER_MAINTENANCE" }],
    updates: [
      { status: "INVESTIGATING", body: "Search will be rebuilding its index and may return incomplete results.", createdAt: daysAgo(0, 2) },
      { status: "MONITORING", body: "Rebuild is in progress, roughly 60% complete.", createdAt: daysAgo(0, 4) },
    ],
  });

  // Upcoming scheduled maintenance
  const maintStart = daysAgo(-3, 1);
  const maintEnd = daysAgo(-3, 4);
  await createIncident({
    name: "Scheduled CDN edge network upgrade",
    status: "INVESTIGATING",
    impact: "NONE",
    isMaintenance: true,
    maintenanceStatus: "SCHEDULED",
    scheduledStart: maintStart,
    scheduledEnd: maintEnd,
    createdAt: daysAgo(0, 9),
    components: [{ componentId: cdn, newStatus: "UNDER_MAINTENANCE" }],
    updates: [
      { status: "INVESTIGATING", body: "We will be upgrading our CDN edge network. Some static assets may load slower during this window.", createdAt: daysAgo(0, 9) },
    ],
  });

  // Resolved incident with full lifecycle + postmortem
  const resolvedApi = await createIncident({
    name: "Elevated API latency in US-East",
    status: "RESOLVED",
    impact: "MAJOR",
    createdAt: daysAgo(2, 14),
    resolvedAt: daysAgo(2, 15.5),
    postmortemBody:
      "## Summary\nA misconfigured autoscaling policy caused the US-East API fleet to scale down during a traffic spike, resulting in elevated latency and a small number of timeouts for roughly 90 minutes.\n\n## Timeline\n- 14:00 UTC: Traffic spike begins, latency starts climbing\n- 14:06 UTC: Alerts fire, on-call begins investigating\n- 14:20 UTC: Root cause identified as autoscaling max-instance cap\n- 14:35 UTC: Cap raised, new instances come online\n- 15:30 UTC: Latency returns to baseline, incident resolved\n\n## Root Cause\nThe autoscaling group's max-instance cap was left at a value set during a previous cost-optimization pass and no longer matched current traffic patterns.\n\n## Remediation\n- Raised the autoscaling cap and added alerting when utilization approaches it\n- Added a quarterly review of autoscaling limits against traffic trends",
    postmortemPublishedAt: daysAgo(1, 10),
    components: [{ componentId: api, newStatus: "DEGRADED_PERFORMANCE" }],
    updates: [
      { status: "INVESTIGATING", body: "We are investigating elevated latency on the Public API in US-East.", createdAt: daysAgo(2, 14) },
      { status: "IDENTIFIED", body: "Root cause identified as an autoscaling limit preventing the fleet from scaling up during a traffic spike.", createdAt: daysAgo(2, 14.3) },
      { status: "MONITORING", body: "We've raised the autoscaling limit and are seeing latency recover. Continuing to monitor.", createdAt: daysAgo(2, 14.8) },
      { status: "RESOLVED", body: "Latency has been at baseline for 30 minutes. This incident is resolved. A postmortem will follow.", createdAt: daysAgo(2, 15.5) },
    ],
  });
  void resolvedApi;

  // Resolved minor incident
  await createIncident({
    name: "Intermittent CDN cache misses",
    status: "RESOLVED",
    impact: "MINOR",
    createdAt: daysAgo(6, 9),
    resolvedAt: daysAgo(6, 10),
    components: [{ componentId: cdn, newStatus: "PARTIAL_OUTAGE" }],
    updates: [
      { status: "INVESTIGATING", body: "We're seeing an increase in cache misses on our CDN, leading to slower page loads for some users.", createdAt: daysAgo(6, 9) },
      { status: "IDENTIFIED", body: "A cache purge job ran with an overly broad pattern. We're re-warming affected caches.", createdAt: daysAgo(6, 9.5) },
      { status: "RESOLVED", body: "Caches have been re-warmed and hit rates are back to normal.", createdAt: daysAgo(6, 10) },
    ],
  });

  // Resolved outage, dashboard
  await createIncident({
    name: "Customer dashboard login failures",
    status: "RESOLVED",
    impact: "MAJOR",
    createdAt: daysAgo(9, 11),
    resolvedAt: daysAgo(9, 12.5),
    components: [{ componentId: dashboard, newStatus: "MAJOR_OUTAGE" }],
    updates: [
      { status: "INVESTIGATING", body: "Some users are unable to log in to the Customer Dashboard.", createdAt: daysAgo(9, 11) },
      { status: "IDENTIFIED", body: "An expired TLS certificate on our auth proxy is blocking logins. Deploying a renewed certificate now.", createdAt: daysAgo(9, 11.5) },
      { status: "MONITORING", body: "New certificate is live, login success rates are recovering.", createdAt: daysAgo(9, 12) },
      { status: "RESOLVED", body: "Login is fully restored. We're adding automated certificate renewal to prevent recurrence.", createdAt: daysAgo(9, 12.5) },
    ],
  });

  // Backfilled historical outage, no notifications
  await createIncident({
    name: "Email delivery delays",
    status: "RESOLVED",
    impact: "MINOR",
    backfilled: true,
    notifySubscribers: false,
    createdAt: daysAgo(13, 8),
    resolvedAt: daysAgo(13, 9),
    components: [{ componentId: email, newStatus: "DEGRADED_PERFORMANCE" }],
    updates: [
      { status: "INVESTIGATING", body: "Transactional emails are being delayed by up to 20 minutes.", createdAt: daysAgo(13, 8) },
      { status: "RESOLVED", body: "Our email provider resolved a queueing issue on their end. Delivery times are back to normal.", createdAt: daysAgo(13, 9) },
    ],
  });

  console.log("Seeding metrics...");
  const latencyMetric = new ObjectId();
  await collections.metrics().insertOne({ _id: latencyMetric, pageId: page._id, componentId: api, name: "API Latency (p95)", suffix: "ms", description: "", visible: true, decimals: 0 });
  const uptimeMetric = new ObjectId();
  await collections.metrics().insertOne({ _id: uptimeMetric, pageId: page._id, componentId: null, name: "Platform Uptime", suffix: "%", description: "", visible: true, decimals: 2 });

  const points: { _id: ObjectId; metricId: ObjectId; timestamp: Date; value: number }[] = [];
  for (let h = 24 * 14; h >= 0; h--) {
    const ts = new Date();
    ts.setHours(ts.getHours() - h);
    const spike = h < 6 ? 150 : 0;
    points.push({ _id: new ObjectId(), metricId: latencyMetric, timestamp: ts, value: 90 + Math.random() * 30 + spike });
    points.push({ _id: new ObjectId(), metricId: uptimeMetric, timestamp: ts, value: 99.4 + Math.random() * 0.6 });
  }
  await collections.metricPoints().insertMany(points);

  console.log("Seeding subscribers...");
  await collections.subscribers().insertMany([
    { _id: new ObjectId(), pageId: page._id, channel: "EMAIL", contact: "ops@globex.test", componentIds: "[]", verified: true, quarantined: false, unsubscribeToken: new ObjectId().toHexString(), createdAt: new Date() },
    { _id: new ObjectId(), pageId: page._id, channel: "SMS", contact: "+14155550199", componentIds: "[]", verified: true, quarantined: false, unsubscribeToken: new ObjectId().toHexString(), createdAt: new Date() },
  ]);

  console.log("\nGlobex seed complete.");
  console.log("Public page: /globex");
  console.log("Admin login: admin@globex.test / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await mongoClient.close();
  });

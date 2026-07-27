import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { collections, mongoClient } from "@/lib/db";
import { ensureIndexes } from "@/lib/ensure-indexes";
import { DEFAULT_MONITOR_TEMPLATES } from "@/lib/default-monitor-templates";
import { canonicalizeEmail, canonicalizeUsername } from "@/lib/identity";
import { generateApiKey, generateAutomationToken } from "@/lib/tokens";
import { createMonitor as createMonitorDomain, type MonitorInput } from "@/lib/domain/monitors";
import {
  assertDevelopmentSeedEnabled,
  generateDevelopmentPassword,
  printGeneratedSecrets,
} from "@/scripts/dev-seed";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function upsertPage(slug: string, data: Record<string, unknown>) {
  const now = new Date();
  const { publicVisible, deletedAt, deletedBy, ...insertData } = data;
  await collections.pages().updateOne(
    { slug },
    {
      $setOnInsert: { ...insertData, slug, createdAt: now },
      $set: {
        publicVisible: publicVisible === false ? false : true,
        deletedAt: deletedAt instanceof Date ? deletedAt : null,
        deletedBy: deletedBy instanceof ObjectId ? deletedBy : null,
      },
    },
    { upsert: true }
  );
  return (await collections.pages().findOne({ slug }))!;
}

async function main() {
  assertDevelopmentSeedEnabled("The Acme sample-data seed");

  const adminPassword = generateDevelopmentPassword();
  const responderPassword = generateDevelopmentPassword();
  const privatePagePassword = generateDevelopmentPassword();
  const customerAPassword = generateDevelopmentPassword();
  const customerBPassword = generateDevelopmentPassword();
  const developmentApiKey = generateApiKey();

  console.log("Ensuring indexes...");
  await ensureIndexes();

  console.log("Seeding monitor templates...");
  for (const template of DEFAULT_MONITOR_TEMPLATES) {
    await collections.monitorTemplates().updateOne(
      { name: template.name },
      { $setOnInsert: { _id: new ObjectId(), ...template } },
      { upsert: true }
    );
  }

  console.log("Seeding organization + team...");
  await collections.organizations().updateOne(
    { slug: "acme" },
    {
      $setOnInsert: {
        name: "Acme Corporation",
        slug: "acme",
        contactEmail: "admin@acme.test",
        suspended: false,
        status: "ACTIVE",
        statusReason: null,
        statusChangedAt: new Date(),
        statusChangedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
  const org = (await collections.organizations().findOne({ slug: "acme" }))!;

  async function seedMember(
    email: string,
    name: string,
    role: "ADMIN" | "RESPONDER",
    password: string
  ) {
    const canonicalEmail = canonicalizeEmail(email);
    const canonicalUsername = canonicalizeUsername(
      role === "ADMIN" ? "acme-admin" : "acme-responder"
    );
    const passwordHash = await bcrypt.hash(password, 10);
    await collections.users().updateOne(
      { canonicalEmail },
      {
        $set: { username: canonicalUsername, canonicalUsername, email, canonicalEmail, name, passwordHash, twoFactorEnabled: false, disabled: false, updatedAt: new Date() },
        $setOnInsert: { _id: new ObjectId(), createdAt: new Date() },
      },
      { upsert: true }
    );
    const user = (await collections.users().findOne({ canonicalEmail }))!;
    await collections.memberships().updateOne(
      { orgId: org._id, userId: user._id },
      {
        $set: { role, status: "ACTIVE", pageIds: null, invitationExpiresAt: null },
        $setOnInsert: { _id: new ObjectId(), activatedAt: new Date(), createdAt: new Date() },
      },
      { upsert: true }
    );
  }
  await seedMember("admin@acme.test", "Ada Admin", "ADMIN", adminPassword);
  await seedMember("editor@acme.test", "Eden Editor", "RESPONDER", responderPassword);

  console.log("Rotating the development sample API key...");
  await collections.apiKeys().deleteMany({
    orgId: org._id,
    $or: [
      { name: "Development sample API key" },
      { name: "Default API Key", prefix: /^status_live_demo_/ },
    ],
  });
  await collections.apiKeys().insertOne({
    _id: new ObjectId(),
    orgId: org._id,
    name: "Development sample API key",
    keyHash: developmentApiKey.hash,
    prefix: developmentApiKey.prefix,
    lastFour: developmentApiKey.lastFour,
    createdAt: new Date(),
    lastUsedAt: null,
    revokedAt: null,
  });

  console.log("Seeding hub page...");
  const hub = await upsertPage("acme", {
    orgId: org._id,
    name: "Acme Status",
    type: "PUBLIC",
    isHub: true,
    hubParentId: null,
    timezone: "UTC",
    language: "en",
    headline: "Acme Status",
    aboutText: "Illustrative status and incident history for Acme sample products.",
    logoUrl: null,
    faviconUrl: null,
    coverImageUrl: null,
    coverImageFit: "CONTAIN",
    coverImagePositionX: 50,
    coverImagePositionY: 50,
    brandColor: "#0052CC",
    supportUrl: "https://acme.test/support",
    passwordHash: null,
    removeBranding: false,
    customCss: null,
  });

  console.log("Seeding child page: API Platform...");
  const apiPage = await upsertPage("api-platform", {
    orgId: org._id,
    name: "API Platform",
    type: "PUBLIC",
    isHub: false,
    hubParentId: hub._id,
    timezone: "UTC",
    language: "en",
    headline: "API Platform Status",
    aboutText: "Status for Acme's public REST and GraphQL APIs.",
    logoUrl: null,
    faviconUrl: null,
    coverImageUrl: null,
    coverImageFit: "CONTAIN",
    coverImagePositionX: 50,
    coverImagePositionY: 50,
    brandColor: "#0052CC",
    supportUrl: "https://acme.test/support",
    passwordHash: null,
    removeBranding: false,
    customCss: null,
  });

  console.log("Seeding child page: Consumer App...");
  const appPage = await upsertPage("consumer-app", {
    orgId: org._id,
    name: "Consumer App",
    type: "PUBLIC",
    isHub: false,
    hubParentId: hub._id,
    timezone: "UTC",
    language: "en",
    headline: "Consumer App Status",
    aboutText: "Status for the Acme mobile and web application.",
    logoUrl: null,
    faviconUrl: null,
    coverImageUrl: null,
    coverImageFit: "CONTAIN",
    coverImagePositionX: 50,
    coverImagePositionY: 50,
    brandColor: "#0052CC",
    supportUrl: "https://acme.test/support",
    passwordHash: null,
    removeBranding: false,
    customCss: null,
  });

  console.log("Seeding private internal-tools page...");
  const privatePagePasswordHash = await bcrypt.hash(privatePagePassword, 10);
  const internalPage = await upsertPage("internal-tools", {
    orgId: org._id,
    name: "Internal Tools",
    type: "PRIVATE",
    isHub: false,
    hubParentId: null,
    timezone: "UTC",
    language: "en",
    headline: "Internal Tools Status",
    aboutText: "Employee-only status for internal systems.",
    logoUrl: null,
    faviconUrl: null,
    coverImageUrl: null,
    coverImageFit: "CONTAIN",
    coverImagePositionX: 50,
    coverImagePositionY: 50,
    brandColor: "#5E35B1",
    supportUrl: null,
    passwordHash: privatePagePasswordHash,
    removeBranding: false,
    customCss: null,
  });
  await collections.pages().updateOne(
    { _id: internalPage._id },
    { $set: { passwordHash: privatePagePasswordHash } }
  );

  console.log("Seeding audience-specific enterprise page...");
  const audiencePage = await upsertPage("enterprise-customers", {
    orgId: org._id,
    name: "Enterprise Customers",
    type: "AUDIENCE",
    isHub: false,
    hubParentId: null,
    timezone: "UTC",
    language: "en",
    headline: "Your Acme Enterprise Status",
    aboutText: "A tailored status view for enterprise customers.",
    logoUrl: null,
    faviconUrl: null,
    coverImageUrl: null,
    coverImageFit: "CONTAIN",
    coverImagePositionX: 50,
    coverImagePositionY: 50,
    brandColor: "#00838F",
    supportUrl: null,
    passwordHash: null,
    removeBranding: false,
    customCss: null,
  });

  console.log("Seeding hidden and deleted lifecycle examples...");
  const hiddenPage = await upsertPage("operations-preview", {
    orgId: org._id,
    name: "Operations Preview",
    type: "PUBLIC",
    isHub: false,
    hubParentId: null,
    timezone: "UTC",
    language: "en",
    headline: "Operations Preview Status",
    aboutText: "A hidden status page for signed-in operational testing.",
    logoUrl: null,
    faviconUrl: null,
    coverImageUrl: null,
    coverImageFit: "CONTAIN",
    coverImagePositionX: 50,
    coverImagePositionY: 50,
    brandColor: "#0F766E",
    supportUrl: null,
    passwordHash: null,
    removeBranding: false,
    customCss: null,
    publicVisible: false,
  });
  const deletedPage = await upsertPage("retired-status", {
    orgId: org._id,
    name: "Retired Status Page",
    type: "PUBLIC",
    isHub: false,
    hubParentId: null,
    timezone: "UTC",
    language: "en",
    headline: "Retired Service Status",
    aboutText: "A soft-deleted sample page available from Deleted Pages.",
    logoUrl: null,
    faviconUrl: null,
    coverImageUrl: null,
    coverImageFit: "CONTAIN",
    coverImagePositionX: 50,
    coverImagePositionY: 50,
    brandColor: "#64748B",
    supportUrl: null,
    passwordHash: null,
    removeBranding: false,
    customCss: null,
    publicVisible: true,
    deletedAt: daysAgo(3),
  });

  // Development sample content is intentionally replaceable. Reset only the records managed by
  // this seed so rerunning it repairs the sample without duplicating history or
  // deleting administrator-created integrations and uploaded branding.
  console.log("Resetting generated sample content...");
  const samplePageIds = [apiPage._id, appPage._id, internalPage._id, audiencePage._id, hiddenPage._id, deletedPage._id];
  const [existingComponents, existingIncidents, existingMetrics, existingMonitors] = await Promise.all([
    collections.components().find({ pageId: { $in: samplePageIds } }, { projection: { _id: 1 } }).toArray(),
    collections.incidents().find({ pageId: { $in: samplePageIds } }, { projection: { _id: 1 } }).toArray(),
    collections.metrics().find({ pageId: { $in: samplePageIds } }, { projection: { _id: 1 } }).toArray(),
    collections.monitors().find({ pageId: { $in: samplePageIds } }, { projection: { _id: 1 } }).toArray(),
  ]);
  const existingComponentIds = existingComponents.map((component) => component._id);
  const existingIncidentIds = existingIncidents.map((incident) => incident._id);
  const existingMetricIds = existingMetrics.map((metric) => metric._id);
  const existingMonitorIds = existingMonitors.map((monitor) => monitor._id);
  await Promise.all([
    existingComponentIds.length
      ? collections.componentStatusEvents().deleteMany({ componentId: { $in: existingComponentIds } })
      : Promise.resolve(),
    existingIncidentIds.length
      ? collections.incidentUpdates().deleteMany({ incidentId: { $in: existingIncidentIds } })
      : Promise.resolve(),
    existingIncidentIds.length
      ? collections.incidentComponents().deleteMany({ incidentId: { $in: existingIncidentIds } })
      : Promise.resolve(),
    existingMetricIds.length
      ? collections.metricPoints().deleteMany({ metricId: { $in: existingMetricIds } })
      : Promise.resolve(),
    existingMonitorIds.length
      ? collections.monitorChecks().deleteMany({ monitorId: { $in: existingMonitorIds } })
      : Promise.resolve(),
    collections.monitors().deleteMany({ pageId: { $in: samplePageIds } }),
    collections.components().deleteMany({ pageId: { $in: samplePageIds } }),
    collections.componentGroups().deleteMany({ pageId: { $in: samplePageIds } }),
    collections.incidents().deleteMany({ pageId: { $in: samplePageIds } }),
    collections.incidentTemplates().deleteMany({ pageId: { $in: samplePageIds } }),
    collections.templateGroups().deleteMany({ pageId: { $in: samplePageIds } }),
    collections.metrics().deleteMany({ pageId: { $in: samplePageIds } }),
    collections.subscribers().deleteMany({ pageId: { $in: samplePageIds } }),
    collections.pageAccessUsers().deleteMany({ pageId: audiencePage._id }),
    collections.pageAccessGroups().deleteMany({ pageId: audiencePage._id }),
  ]);

  // ---- Components for API Platform ----
  async function createGroup(pageId: ObjectId, name: string, order: number) {
    const _id = new ObjectId();
    await collections.componentGroups().insertOne({ _id, pageId, name, description: "", order, collapsed: false });
    return _id;
  }
  async function createComponent(data: {
    pageId: ObjectId;
    groupId?: ObjectId | null;
    name: string;
    status: string;
    order: number;
    isThirdParty?: boolean;
    thirdPartyProvider?: string | null;
  }) {
    const _id = new ObjectId();
    const automationToken = generateAutomationToken();
    await collections.components().insertOne({
      _id,
      pageId: data.pageId,
      groupId: data.groupId ?? null,
      name: data.name,
      description: "",
      status: data.status,
      manualStatus: data.status,
      order: data.order,
      visible: true,
      showUptime: true,
      isThirdParty: data.isThirdParty ?? false,
      thirdPartyProvider: data.thirdPartyProvider ?? null,
      automationTokenHash: automationToken.hash,
      automationTokenPrefix: automationToken.prefix,
      automationTokenLastFour: automationToken.lastFour,
      createdAt: new Date(),
    });
    return _id;
  }

  const usGroup = await createGroup(apiPage._id, "US Region", 0);
  const euGroup = await createGroup(apiPage._id, "EU Region", 1);

  const restApiUs = await createComponent({ pageId: apiPage._id, groupId: usGroup, name: "REST API", status: "OPERATIONAL", order: 0 });
  const graphqlUs = await createComponent({ pageId: apiPage._id, groupId: usGroup, name: "GraphQL API", status: "OPERATIONAL", order: 1 });
  await createComponent({ pageId: apiPage._id, groupId: euGroup, name: "REST API", status: "OPERATIONAL", order: 0 });
  await createComponent({ pageId: apiPage._id, groupId: euGroup, name: "GraphQL API", status: "DEGRADED_PERFORMANCE", order: 1 });
  const webhooksComp = await createComponent({ pageId: apiPage._id, name: "Webhooks Delivery", status: "OPERATIONAL", order: 2 });
  await createComponent({ pageId: apiPage._id, name: "Authentication", status: "OPERATIONAL", order: 3 });
  await createComponent({ pageId: apiPage._id, name: "Payments (Stripe)", status: "OPERATIONAL", order: 4, isThirdParty: true, thirdPartyProvider: "Stripe" });

  // ---- Components for Consumer App ----
  const website = await createComponent({ pageId: appPage._id, name: "Website", status: "OPERATIONAL", order: 0 });
  await createComponent({ pageId: appPage._id, name: "Mobile App (iOS)", status: "OPERATIONAL", order: 1 });
  await createComponent({ pageId: appPage._id, name: "Mobile App (Android)", status: "OPERATIONAL", order: 2 });
  const notifications = await createComponent({ pageId: appPage._id, name: "Push Notifications", status: "PARTIAL_OUTAGE", order: 3 });

  // ---- Components for Internal Tools ----
  await createComponent({ pageId: internalPage._id, name: "VPN", status: "OPERATIONAL", order: 0 });
  await createComponent({ pageId: internalPage._id, name: "HR Portal", status: "OPERATIONAL", order: 1 });
  await createComponent({ pageId: internalPage._id, name: "Internal Wiki", status: "UNDER_MAINTENANCE", order: 2 });

  // ---- Components for Audience page + access groups ----
  const enterpriseApi = await createComponent({ pageId: audiencePage._id, name: "Enterprise API Gateway", status: "OPERATIONAL", order: 0 });
  const enterpriseSso = await createComponent({ pageId: audiencePage._id, name: "SSO / SAML", status: "OPERATIONAL", order: 1 });
  const enterpriseReporting = await createComponent({ pageId: audiencePage._id, name: "Reporting Pipeline", status: "DEGRADED_PERFORMANCE", order: 2 });
  const hiddenApi = await createComponent({ pageId: hiddenPage._id, name: "Preview API", status: "DEGRADED_PERFORMANCE", order: 0 });
  const retiredApi = await createComponent({ pageId: deletedPage._id, name: "Retired API", status: "OPERATIONAL", order: 0 });

  const sampleMonitorTemplate = await collections.monitorTemplates().findOne({ enabled: true });
  if (sampleMonitorTemplate) {
    await createMonitorDomain(org._id.toHexString(), apiPage._id.toHexString(), {
      templateId: sampleMonitorTemplate._id.toHexString(),
      name: sampleMonitorTemplate.name,
      type: sampleMonitorTemplate.type as MonitorInput["type"],
      componentId: restApiUs.toHexString(),
      target: sampleMonitorTemplate.type === "HEARTBEAT" ? "inbound-heartbeat" : sampleMonitorTemplate.target,
      port: sampleMonitorTemplate.port,
      method: "GET",
      requestBody: null,
      requestHeaders: "",
      expectedStatusRange: sampleMonitorTemplate.expectedStatusRange,
      keywordMatch: sampleMonitorTemplate.keywordMatch,
      keywordAbsent: null,
      sslWarnDays: sampleMonitorTemplate.type === "TLS" ? 14 : null,
      authType: "NONE",
      authUsername: null,
      authSecret: null,
      authHeaderName: null,
      verifyTls: true,
      intervalSec: 300,
      timeoutMs: 10_000,
      failThreshold: 1,
      recoverThreshold: 1,
      downStatus: "MAJOR_OUTAGE",
      actionFlipStatus: true,
      actionRecordMetric: true,
      actionAutoIncident: false,
      actionNotify: false,
      tags: ["global-template"],
      groupName: sampleMonitorTemplate.category,
      heartbeatGraceSec: sampleMonitorTemplate.type === "HEARTBEAT" ? 60 : null,
      dnsRecordType: sampleMonitorTemplate.type === "DNS" ? "A" : null,
      dnsExpectedValue: null,
    });
  }

  const groupA = new ObjectId();
  await collections.pageAccessGroups().insertOne({
    _id: groupA,
    pageId: audiencePage._id,
    name: "Customer A (Gateway + SSO)",
    componentIds: JSON.stringify([enterpriseApi.toHexString(), enterpriseSso.toHexString()]),
  });
  const groupB = new ObjectId();
  await collections.pageAccessGroups().insertOne({
    _id: groupB,
    pageId: audiencePage._id,
    name: "Customer B (Reporting only)",
    componentIds: JSON.stringify([enterpriseReporting.toHexString()]),
  });
  await collections.pageAccessUsers().insertOne({
    _id: new ObjectId(),
    pageId: audiencePage._id,
    email: "customerA@example.com",
    passwordHash: await bcrypt.hash(customerAPassword, 10),
    groupId: groupA,
    componentIds: "[]",
    createdAt: new Date(),
  });
  await collections.pageAccessUsers().insertOne({
    _id: new ObjectId(),
    pageId: audiencePage._id,
    email: "customerB@example.com",
    passwordHash: await bcrypt.hash(customerBPassword, 10),
    groupId: groupB,
    componentIds: "[]",
    createdAt: new Date(),
  });

  // ---- Component status history for uptime bars (90 days) ----
  async function seedHistory(componentId: ObjectId, dips: { daysAgoStart: number; daysAgoEnd: number; status: string }[]) {
    await collections.componentStatusEvents().insertOne({
      _id: new ObjectId(),
      componentId,
      status: "OPERATIONAL",
      startedAt: daysAgo(95),
      endedAt: null,
      isMaintenance: false,
    });
    for (const dip of dips) {
      await collections.componentStatusEvents().insertOne({
        _id: new ObjectId(),
        componentId,
        status: dip.status,
        startedAt: daysAgo(dip.daysAgoStart),
        endedAt: daysAgo(dip.daysAgoEnd),
        isMaintenance: false,
      });
    }
  }
  await seedHistory(restApiUs, [{ daysAgoStart: 12, daysAgoEnd: 12, status: "MAJOR_OUTAGE" }]);
  await seedHistory(graphqlUs, [{ daysAgoStart: 5, daysAgoEnd: 5, status: "DEGRADED_PERFORMANCE" }]);
  await seedHistory(website, [{ daysAgoStart: 30, daysAgoEnd: 29, status: "PARTIAL_OUTAGE" }]);
  await seedHistory(notifications, []);

  // ---- Incidents ----
  async function createIncident(data: {
    pageId: ObjectId;
    name: string;
    status: string;
    impact: string;
    isMaintenance?: boolean;
    maintenanceStatus?: string | null;
    scheduledStart?: Date | null;
    scheduledEnd?: Date | null;
    autoTransition?: boolean;
    notifySubscribers?: boolean;
    backfilled?: boolean;
    createdAt: Date;
    resolvedAt?: Date | null;
    components: { componentId: ObjectId; newStatus: string }[];
    updates: { status: string; body: string; createdAt: Date }[];
  }) {
    const _id = new ObjectId();
    await collections.incidents().insertOne({
      _id,
      pageId: data.pageId,
      name: data.name,
      status: data.status,
      impact: data.impact,
      pageWide: data.components.length === 0,
      isMaintenance: data.isMaintenance ?? false,
      maintenanceStatus: data.maintenanceStatus ?? null,
      scheduledStart: data.scheduledStart ?? null,
      scheduledEnd: data.scheduledEnd ?? null,
      autoTransition: data.autoTransition ?? false,
      notifySubscribers: data.notifySubscribers ?? true,
      postmortemBody: null,
      postmortemPublishedAt: null,
      createdAt: data.createdAt,
      resolvedAt: data.resolvedAt ?? null,
      backfilled: data.backfilled ?? false,
    });
    if (data.components.length) {
      await collections.incidentComponents().insertMany(
        data.components.map((c) => ({ _id: new ObjectId(), incidentId: _id, componentId: c.componentId, newStatus: c.newStatus }))
      );
    }
    if (data.updates.length) {
      await collections.incidentUpdates().insertMany(
        data.updates.map((u) => ({ _id: new ObjectId(), incidentId: _id, status: u.status, body: u.body, createdAt: u.createdAt, notified: false }))
      );
    }
    return _id;
  }

  const incident1 = await createIncident({
    pageId: apiPage._id,
    name: "Elevated error rates on REST API (US)",
    status: "RESOLVED",
    impact: "MAJOR",
    createdAt: daysAgo(12),
    resolvedAt: daysAgo(12),
    components: [{ componentId: restApiUs, newStatus: "MAJOR_OUTAGE" }],
    updates: [
      { status: "INVESTIGATING", body: "We are investigating elevated error rates on the US REST API.", createdAt: daysAgo(12) },
      { status: "IDENTIFIED", body: "We've identified a faulty deploy as the root cause and are rolling it back.", createdAt: daysAgo(12) },
      { status: "MONITORING", body: "The rollback has completed. We are monitoring error rates.", createdAt: daysAgo(12) },
      { status: "RESOLVED", body: "Error rates have returned to normal. This incident is resolved.", createdAt: daysAgo(12) },
    ],
  });

  await createIncident({
    pageId: appPage._id,
    name: "Push notifications delayed",
    status: "MONITORING",
    impact: "MINOR",
    createdAt: daysAgo(0),
    components: [{ componentId: notifications, newStatus: "PARTIAL_OUTAGE" }],
    updates: [
      { status: "INVESTIGATING", body: "We're seeing delays in push notification delivery on Android and iOS.", createdAt: daysAgo(0) },
      { status: "IDENTIFIED", body: "Root cause identified as a backlog in our notification queue. Applying a fix.", createdAt: daysAgo(0) },
      { status: "MONITORING", body: "The queue backlog has been cleared. We're monitoring delivery times.", createdAt: daysAgo(0) },
    ],
  });

  await createIncident({
    pageId: hiddenPage._id,
    name: "Preview API elevated latency",
    status: "INVESTIGATING",
    impact: "MINOR",
    createdAt: daysAgo(0),
    components: [{ componentId: hiddenApi, newStatus: "DEGRADED_PERFORMANCE" }],
    updates: [{ status: "INVESTIGATING", body: "Operators are investigating elevated preview API latency.", createdAt: daysAgo(0) }],
  });

  await createIncident({
    pageId: deletedPage._id,
    name: "Historical retired service incident",
    status: "RESOLVED",
    impact: "MINOR",
    createdAt: daysAgo(20),
    resolvedAt: daysAgo(20),
    components: [{ componentId: retiredApi, newStatus: "PARTIAL_OUTAGE" }],
    updates: [{ status: "RESOLVED", body: "Historical incident retained with the soft-deleted page.", createdAt: daysAgo(20) }],
  });

  await createIncident({
    pageId: apiPage._id,
    name: "GraphQL API latency (EU)",
    status: "IDENTIFIED",
    impact: "MINOR",
    createdAt: daysAgo(0),
    components: [{ componentId: graphqlUs, newStatus: "DEGRADED_PERFORMANCE" }],
    updates: [
      { status: "INVESTIGATING", body: "We are investigating increased latency on the EU GraphQL API.", createdAt: daysAgo(0) },
      { status: "IDENTIFIED", body: "A database connection pool exhaustion has been identified as the cause.", createdAt: daysAgo(0) },
    ],
  });

  // Scheduled maintenance
  const maintStart = new Date();
  maintStart.setDate(maintStart.getDate() + 2);
  const maintEnd = new Date(maintStart);
  maintEnd.setHours(maintEnd.getHours() + 3);
  await createIncident({
    pageId: apiPage._id,
    name: "Scheduled database upgrade",
    status: "INVESTIGATING",
    impact: "NONE",
    isMaintenance: true,
    maintenanceStatus: "SCHEDULED",
    scheduledStart: maintStart,
    scheduledEnd: maintEnd,
    autoTransition: true,
    createdAt: new Date(),
    components: [{ componentId: webhooksComp, newStatus: "UNDER_MAINTENANCE" }],
    updates: [
      {
        status: "INVESTIGATING",
        body: "We will be performing a scheduled database upgrade. Webhook delivery may be delayed during this window.",
        createdAt: new Date(),
      },
    ],
  });

  // Backfilled historical incident (no notifications)
  await createIncident({
    pageId: appPage._id,
    name: "Website outage",
    status: "RESOLVED",
    impact: "CRITICAL",
    backfilled: true,
    notifySubscribers: false,
    createdAt: daysAgo(45),
    resolvedAt: daysAgo(45),
    components: [{ componentId: website, newStatus: "MAJOR_OUTAGE" }],
    updates: [
      { status: "INVESTIGATING", body: "Investigating a full website outage.", createdAt: daysAgo(45) },
      { status: "RESOLVED", body: "Website restored after a CDN configuration rollback.", createdAt: daysAgo(45) },
    ],
  });

  // Published postmortem example
  await collections.incidents().updateOne(
    { _id: incident1 },
    {
      $set: {
        postmortemBody:
          "## Summary\nA faulty deploy introduced a regression that caused elevated 500 errors on the US REST API for approximately 40 minutes.\n\n## Timeline\n- 14:02 UTC: Deploy shipped\n- 14:08 UTC: Error rate alerts fired, investigation began\n- 14:22 UTC: Root cause identified, rollback started\n- 14:40 UTC: Rollback complete, error rates normal\n\n## Root Cause\nAn unhandled null case in the request validation middleware caused a crash loop under specific payloads.\n\n## Remediation\nWe added regression tests for this payload shape and are adding canary deploys to catch similar issues before full rollout.",
        postmortemPublishedAt: daysAgo(11),
      },
    }
  );

  // ---- Incident templates ----
  const tg = new ObjectId();
  await collections.templateGroups().insertOne({ _id: tg, pageId: apiPage._id, name: "Common Incidents" });
  await collections.incidentTemplates().insertMany([
    {
      _id: new ObjectId(),
      pageId: apiPage._id,
      groupId: tg,
      title: "Elevated error rates",
      body: "We are investigating elevated error rates on {{component}}. We will provide updates as we learn more.",
      defaultStatus: "INVESTIGATING",
      defaultImpact: "MAJOR",
      defaultComponentIds: "[]",
      createdAt: new Date(),
    },
    {
      _id: new ObjectId(),
      pageId: apiPage._id,
      groupId: tg,
      title: "Increased latency",
      body: "We are seeing increased latency on {{component}} and are investigating the cause.",
      defaultStatus: "INVESTIGATING",
      defaultImpact: "MINOR",
      defaultComponentIds: "[]",
      createdAt: new Date(),
    },
  ]);

  // ---- Metrics ----
  const respTime = new ObjectId();
  await collections.metrics().insertOne({
    _id: respTime, pageId: apiPage._id, componentId: restApiUs, name: "API Response Time", suffix: "ms", description: "", visible: true, decimals: 0,
  });
  const uptimeMetric = new ObjectId();
  await collections.metrics().insertOne({
    _id: uptimeMetric, pageId: apiPage._id, componentId: null, name: "Overall Uptime", suffix: "%", description: "", visible: true, decimals: 2,
  });
  const errorRate = new ObjectId();
  await collections.metrics().insertOne({
    _id: errorRate, pageId: appPage._id, componentId: null, name: "Mobile Crash-Free Rate", suffix: "%", description: "", visible: true, decimals: 2,
  });

  const points: { _id: ObjectId; metricId: ObjectId; timestamp: Date; value: number }[] = [];
  for (let h = 24 * 14; h >= 0; h--) {
    const ts = new Date();
    ts.setHours(ts.getHours() - h);
    points.push({ _id: new ObjectId(), metricId: respTime, timestamp: ts, value: 80 + Math.random() * 40 + (h < 5 ? 100 : 0) });
    points.push({ _id: new ObjectId(), metricId: uptimeMetric, timestamp: ts, value: 99.5 + Math.random() * 0.5 });
    points.push({ _id: new ObjectId(), metricId: errorRate, timestamp: ts, value: 99 + Math.random() * 1 });
  }
  await collections.metricPoints().insertMany(points);

  // ---- Subscribers ----
  await collections.subscribers().insertMany([
    { _id: new ObjectId(), pageId: apiPage._id, channel: "EMAIL", contact: "dev1@example.com", componentIds: "[]", verified: true, quarantined: false, unsubscribeToken: new ObjectId().toHexString(), createdAt: new Date() },
    { _id: new ObjectId(), pageId: apiPage._id, channel: "EMAIL", contact: "dev2@example.com", componentIds: JSON.stringify([restApiUs.toHexString()]), verified: true, quarantined: false, unsubscribeToken: new ObjectId().toHexString(), createdAt: new Date() },
    { _id: new ObjectId(), pageId: apiPage._id, channel: "SMS", contact: "+14155550100", componentIds: "[]", verified: true, quarantined: false, unsubscribeToken: new ObjectId().toHexString(), createdAt: new Date() },
    { _id: new ObjectId(), pageId: apiPage._id, channel: "WEBHOOK", contact: "https://example.com/webhook-receiver", componentIds: "[]", verified: true, quarantined: false, unsubscribeToken: new ObjectId().toHexString(), createdAt: new Date() },
    { _id: new ObjectId(), pageId: apiPage._id, channel: "EMAIL", contact: "bounced@example.com", componentIds: "[]", verified: true, quarantined: true, unsubscribeToken: new ObjectId().toHexString(), createdAt: new Date() },
    { _id: new ObjectId(), pageId: appPage._id, channel: "EMAIL", contact: "user1@example.com", componentIds: "[]", verified: true, quarantined: false, unsubscribeToken: new ObjectId().toHexString(), createdAt: new Date() },
    { _id: new ObjectId(), pageId: appPage._id, channel: "EMAIL", contact: "pending@example.com", componentIds: "[]", verified: false, quarantined: false, unsubscribeToken: new ObjectId().toHexString(), createdAt: new Date() },
  ]);

  console.log("Development sample seed complete.");
  printGeneratedSecrets("Acme development sample", [
    { label: "Owner (admin@acme.test)", value: adminPassword },
    { label: "Responder (editor@acme.test)", value: responderPassword },
    { label: "Private page (/internal-tools)", value: privatePagePassword },
    { label: "Audience user (customerA@example.com)", value: customerAPassword },
    { label: "Audience user (customerB@example.com)", value: customerBPassword },
    { label: "Management API key", value: developmentApiKey.token },
  ]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await mongoClient.close();
  });

import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { collections, mongoClient } from "@/lib/db";
import { ensureIndexes } from "@/lib/ensure-indexes";

const THIRD_PARTY_PROVIDERS = [
  { name: "AWS", category: "Cloud Infrastructure" },
  { name: "Google Cloud Platform", category: "Cloud Infrastructure" },
  { name: "Microsoft Azure", category: "Cloud Infrastructure" },
  { name: "Cloudflare", category: "CDN / Networking" },
  { name: "Fastly", category: "CDN / Networking" },
  { name: "Stripe", category: "Payments" },
  { name: "PayPal", category: "Payments" },
  { name: "Braintree", category: "Payments" },
  { name: "Twilio", category: "Communications" },
  { name: "SendGrid", category: "Email" },
  { name: "Mailgun", category: "Email" },
  { name: "Postmark", category: "Email" },
  { name: "Auth0", category: "Identity" },
  { name: "Okta", category: "Identity" },
  { name: "GitHub", category: "Developer Tools" },
  { name: "GitLab", category: "Developer Tools" },
  { name: "npm", category: "Developer Tools" },
  { name: "Docker Hub", category: "Developer Tools" },
  { name: "MongoDB Atlas", category: "Database" },
  { name: "PlanetScale", category: "Database" },
  { name: "Redis Cloud", category: "Database" },
  { name: "Elastic Cloud", category: "Search / Analytics" },
  { name: "Algolia", category: "Search / Analytics" },
  { name: "Segment", category: "Analytics" },
  { name: "Datadog", category: "Monitoring" },
  { name: "New Relic", category: "Monitoring" },
  { name: "Pingdom", category: "Monitoring" },
  { name: "PagerDuty", category: "Incident Response" },
  { name: "Opsgenie", category: "Incident Response" },
  { name: "Slack", category: "ChatOps" },
  { name: "Microsoft Teams", category: "ChatOps" },
  { name: "Zendesk", category: "Support / ITSM" },
  { name: "Jira Service Management", category: "Support / ITSM" },
  { name: "Intercom", category: "Support / ITSM" },
  { name: "Akamai", category: "CDN / Networking" },
  { name: "DigitalOcean", category: "Cloud Infrastructure" },
  { name: "Heroku", category: "Cloud Infrastructure" },
  { name: "Vercel", category: "Cloud Infrastructure" },
  { name: "Netlify", category: "Cloud Infrastructure" },
  { name: "Firebase", category: "Cloud Infrastructure" },
  { name: "Shopify", category: "E-commerce" },
  { name: "Zoom", category: "Communications" },
  { name: "Twitter / X API", category: "Social" },
  { name: "Google Maps Platform", category: "Location" },
  { name: "Plaid", category: "Fintech" },
  { name: "Recurly", category: "Billing" },
  { name: "Chargebee", category: "Billing" },
  { name: "LaunchDarkly", category: "Feature Flags" },
  { name: "Sentry", category: "Monitoring" },
  { name: "CircleCI", category: "CI/CD" },
  { name: "Travis CI", category: "CI/CD" },
];

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function upsertPage(slug: string, data: Record<string, unknown>) {
  const now = new Date();
  await collections.pages().updateOne(
    { slug },
    { $setOnInsert: { ...data, slug, createdAt: now } },
    { upsert: true }
  );
  return (await collections.pages().findOne({ slug }))!;
}

async function main() {
  console.log("Ensuring indexes...");
  await ensureIndexes();

  console.log("Seeding third-party provider catalog...");
  await collections.thirdPartyProviders().deleteMany({});
  await collections.thirdPartyProviders().insertMany(
    THIRD_PARTY_PROVIDERS.map((p) => ({ _id: new ObjectId(), name: p.name, category: p.category, homepage: "" }))
  );

  console.log("Seeding organization + team...");
  await collections.organizations().updateOne(
    { slug: "acme" },
    { $setOnInsert: { name: "Acme Corporation", slug: "acme", plan: "enterprise", createdAt: new Date() } },
    { upsert: true }
  );
  const org = (await collections.organizations().findOne({ slug: "acme" }))!;

  const passwordHash = await bcrypt.hash("password123", 10);
  // Old 4-role seed accounts (OWNER/ADMIN/EDITOR/RESPONDER) collapsed to 2 under the 3-role model.
  await collections.teamMembers().deleteMany({ orgId: org._id, email: { $in: ["admin2@acme.test", "responder@acme.test"] } });
  await collections.teamMembers().updateOne(
    { orgId: org._id, email: "admin@acme.test" },
    {
      $set: { role: "TENANT_ADMIN" },
      $setOnInsert: { orgId: org._id, email: "admin@acme.test", passwordHash, name: "Ada Admin", twoFactorEnabled: false, createdAt: new Date() },
    },
    { upsert: true }
  );
  await collections.teamMembers().updateOne(
    { orgId: org._id, email: "editor@acme.test" },
    {
      $set: { role: "TENANT_USER" },
      $setOnInsert: { orgId: org._id, email: "editor@acme.test", passwordHash, name: "Eden Editor", twoFactorEnabled: false, createdAt: new Date() },
    },
    { upsert: true }
  );

  console.log("Seeding platform admin...");
  await collections.platformAdmins().updateOne(
    { email: "platform@statuspage.test" },
    { $setOnInsert: { email: "platform@statuspage.test", passwordHash, name: "Priya Platform", createdAt: new Date() } },
    { upsert: true }
  );

  await collections.apiKeys().updateOne(
    { key: "sp_live_demo_1234567890abcdef1234567890ab" },
    { $setOnInsert: { orgId: org._id, name: "Default API Key", key: "sp_live_demo_1234567890abcdef1234567890ab", createdAt: new Date(), lastUsedAt: null } },
    { upsert: true }
  );

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
    aboutText: "Real-time status and incident history for every Acme product.",
    logoUrl: null,
    faviconUrl: null,
    brandColor: "#0052CC",
    supportUrl: "https://acme.test/support",
    customDomain: null,
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
    brandColor: "#0052CC",
    supportUrl: "https://acme.test/support",
    customDomain: null,
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
    brandColor: "#0052CC",
    supportUrl: "https://acme.test/support",
    customDomain: null,
    passwordHash: null,
    removeBranding: false,
    customCss: null,
  });

  console.log("Seeding private internal-tools page...");
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
    brandColor: "#5E35B1",
    supportUrl: null,
    customDomain: null,
    passwordHash: await bcrypt.hash("internal123", 10),
    removeBranding: false,
    customCss: null,
  });

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
    brandColor: "#00838F",
    supportUrl: null,
    customDomain: null,
    passwordHash: null,
    removeBranding: false,
    customCss: null,
  });

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
    await collections.components().insertOne({
      _id,
      pageId: data.pageId,
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
    passwordHash: await bcrypt.hash("demo123", 10),
    groupId: groupA,
    componentIds: "[]",
    createdAt: new Date(),
  });
  await collections.pageAccessUsers().insertOne({
    _id: new ObjectId(),
    pageId: audiencePage._id,
    email: "customerB@example.com",
    passwordHash: await bcrypt.hash("demo123", 10),
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

  console.log("Seed complete.");
  console.log("Admin login: admin@acme.test / password123");
  console.log("Private page password (internal-tools): internal123");
  console.log("Audience page logins: customerA@example.com / demo123, customerB@example.com / demo123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await mongoClient.close();
  });

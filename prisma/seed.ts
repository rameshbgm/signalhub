import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

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

async function main() {
  console.log("Seeding third-party provider catalog...");
  await prisma.thirdPartyProvider.deleteMany();
  await prisma.thirdPartyProvider.createMany({
    data: THIRD_PARTY_PROVIDERS.map((p) => ({ name: p.name, category: p.category, homepage: "" })),
  });

  console.log("Seeding organization + team...");
  const org = await prisma.organization.upsert({
    where: { slug: "acme" },
    update: {},
    create: {
      name: "Acme Corporation",
      slug: "acme",
      plan: "enterprise",
    },
  });

  const passwordHash = await bcrypt.hash("password123", 10);
  await prisma.teamMember.upsert({
    where: { orgId_email: { orgId: org.id, email: "admin@acme.test" } },
    update: {},
    create: {
      orgId: org.id,
      email: "admin@acme.test",
      passwordHash,
      name: "Ada Admin",
      role: "OWNER",
    },
  });
  await prisma.teamMember.upsert({
    where: { orgId_email: { orgId: org.id, email: "responder@acme.test" } },
    update: {},
    create: {
      orgId: org.id,
      email: "responder@acme.test",
      passwordHash,
      name: "Riley Responder",
      role: "RESPONDER",
    },
  });

  await prisma.apiKey.create({
    data: { orgId: org.id, name: "Default API Key", key: "sp_live_demo_1234567890abcdef1234567890ab" },
  }).catch(() => {});

  console.log("Seeding hub page...");
  const hub = await prisma.page.upsert({
    where: { slug: "acme" },
    update: {},
    create: {
      orgId: org.id,
      name: "Acme Status",
      slug: "acme",
      type: "PUBLIC",
      isHub: true,
      headline: "Acme Status",
      aboutText: "Real-time status and incident history for every Acme product.",
      brandColor: "#0052CC",
      supportUrl: "https://acme.test/support",
    },
  });

  console.log("Seeding child page: API Platform...");
  const apiPage = await prisma.page.upsert({
    where: { slug: "api-platform" },
    update: {},
    create: {
      orgId: org.id,
      name: "API Platform",
      slug: "api-platform",
      type: "PUBLIC",
      hubParentId: hub.id,
      headline: "API Platform Status",
      aboutText: "Status for Acme's public REST and GraphQL APIs.",
      brandColor: "#0052CC",
      supportUrl: "https://acme.test/support",
    },
  });

  console.log("Seeding child page: Consumer App...");
  const appPage = await prisma.page.upsert({
    where: { slug: "consumer-app" },
    update: {},
    create: {
      orgId: org.id,
      name: "Consumer App",
      slug: "consumer-app",
      type: "PUBLIC",
      hubParentId: hub.id,
      headline: "Consumer App Status",
      aboutText: "Status for the Acme mobile and web application.",
      brandColor: "#0052CC",
      supportUrl: "https://acme.test/support",
    },
  });

  console.log("Seeding private internal-tools page...");
  const internalPage = await prisma.page.upsert({
    where: { slug: "internal-tools" },
    update: {},
    create: {
      orgId: org.id,
      name: "Internal Tools",
      slug: "internal-tools",
      type: "PRIVATE",
      headline: "Internal Tools Status",
      aboutText: "Employee-only status for internal systems.",
      brandColor: "#5E35B1",
      passwordHash: await bcrypt.hash("internal123", 10),
    },
  });

  console.log("Seeding audience-specific enterprise page...");
  const audiencePage = await prisma.page.upsert({
    where: { slug: "enterprise-customers" },
    update: {},
    create: {
      orgId: org.id,
      name: "Enterprise Customers",
      slug: "enterprise-customers",
      type: "AUDIENCE",
      headline: "Your Acme Enterprise Status",
      aboutText: "A tailored status view for enterprise customers.",
      brandColor: "#00838F",
    },
  });

  // ---- Components for API Platform ----
  const usGroup = await prisma.componentGroup.create({
    data: { pageId: apiPage.id, name: "US Region", order: 0 },
  });
  const euGroup = await prisma.componentGroup.create({
    data: { pageId: apiPage.id, name: "EU Region", order: 1 },
  });

  const restApiUs = await prisma.component.create({
    data: { pageId: apiPage.id, groupId: usGroup.id, name: "REST API", status: "OPERATIONAL", order: 0 },
  });
  const graphqlUs = await prisma.component.create({
    data: { pageId: apiPage.id, groupId: usGroup.id, name: "GraphQL API", status: "OPERATIONAL", order: 1 },
  });
  await prisma.component.create({
    data: { pageId: apiPage.id, groupId: euGroup.id, name: "REST API", status: "OPERATIONAL", order: 0 },
  });
  await prisma.component.create({
    data: { pageId: apiPage.id, groupId: euGroup.id, name: "GraphQL API", status: "DEGRADED_PERFORMANCE", order: 1 },
  });
  const webhooksComp = await prisma.component.create({
    data: { pageId: apiPage.id, name: "Webhooks Delivery", status: "OPERATIONAL", order: 2 },
  });
  const authComp = await prisma.component.create({
    data: { pageId: apiPage.id, name: "Authentication", status: "OPERATIONAL", order: 3 },
  });
  const stripeMirror = await prisma.component.create({
    data: {
      pageId: apiPage.id,
      name: "Payments (Stripe)",
      status: "OPERATIONAL",
      order: 4,
      isThirdParty: true,
      thirdPartyProvider: "Stripe",
    },
  });

  // ---- Components for Consumer App ----
  const website = await prisma.component.create({
    data: { pageId: appPage.id, name: "Website", status: "OPERATIONAL", order: 0 },
  });
  const mobileIos = await prisma.component.create({
    data: { pageId: appPage.id, name: "Mobile App (iOS)", status: "OPERATIONAL", order: 1 },
  });
  const mobileAndroid = await prisma.component.create({
    data: { pageId: appPage.id, name: "Mobile App (Android)", status: "OPERATIONAL", order: 2 },
  });
  const notifications = await prisma.component.create({
    data: { pageId: appPage.id, name: "Push Notifications", status: "PARTIAL_OUTAGE", order: 3 },
  });

  // ---- Components for Internal Tools ----
  await prisma.component.create({ data: { pageId: internalPage.id, name: "VPN", status: "OPERATIONAL", order: 0 } });
  await prisma.component.create({ data: { pageId: internalPage.id, name: "HR Portal", status: "OPERATIONAL", order: 1 } });
  await prisma.component.create({ data: { pageId: internalPage.id, name: "Internal Wiki", status: "UNDER_MAINTENANCE", order: 2 } });

  // ---- Components for Audience page + access groups ----
  const enterpriseApi = await prisma.component.create({
    data: { pageId: audiencePage.id, name: "Enterprise API Gateway", status: "OPERATIONAL", order: 0 },
  });
  const enterpriseSso = await prisma.component.create({
    data: { pageId: audiencePage.id, name: "SSO / SAML", status: "OPERATIONAL", order: 1 },
  });
  const enterpriseReporting = await prisma.component.create({
    data: { pageId: audiencePage.id, name: "Reporting Pipeline", status: "DEGRADED_PERFORMANCE", order: 2 },
  });

  const groupA = await prisma.pageAccessGroup.create({
    data: { pageId: audiencePage.id, name: "Customer A (Gateway + SSO)", componentIds: JSON.stringify([enterpriseApi.id, enterpriseSso.id]) },
  });
  const groupB = await prisma.pageAccessGroup.create({
    data: { pageId: audiencePage.id, name: "Customer B (Reporting only)", componentIds: JSON.stringify([enterpriseReporting.id]) },
  });
  await prisma.pageAccessUser.create({
    data: { pageId: audiencePage.id, email: "customerA@example.com", passwordHash: await bcrypt.hash("demo123", 10), groupId: groupA.id },
  });
  await prisma.pageAccessUser.create({
    data: { pageId: audiencePage.id, email: "customerB@example.com", passwordHash: await bcrypt.hash("demo123", 10), groupId: groupB.id },
  });

  // ---- Component status history for uptime bars (90 days) ----
  async function seedHistory(componentId: string, dips: { daysAgoStart: number; daysAgoEnd: number; status: string }[]) {
    await prisma.componentStatusEvent.create({
      data: { componentId, status: "OPERATIONAL", startedAt: daysAgo(95) },
    });
    for (const dip of dips) {
      await prisma.componentStatusEvent.create({
        data: {
          componentId,
          status: dip.status,
          startedAt: daysAgo(dip.daysAgoStart),
          endedAt: daysAgo(dip.daysAgoEnd),
        },
      });
    }
  }
  await seedHistory(restApiUs.id, [{ daysAgoStart: 12, daysAgoEnd: 12, status: "MAJOR_OUTAGE" }]);
  await seedHistory(graphqlUs.id, [{ daysAgoStart: 5, daysAgoEnd: 5, status: "DEGRADED_PERFORMANCE" }]);
  await seedHistory(website.id, [{ daysAgoStart: 30, daysAgoEnd: 29, status: "PARTIAL_OUTAGE" }]);
  await seedHistory(notifications.id, []);

  // ---- Incidents ----
  const incident1 = await prisma.incident.create({
    data: {
      pageId: apiPage.id,
      name: "Elevated error rates on REST API (US)",
      status: "RESOLVED",
      impact: "MAJOR",
      createdAt: daysAgo(12),
      resolvedAt: daysAgo(12),
      components: { create: [{ componentId: restApiUs.id, newStatus: "MAJOR_OUTAGE" }] },
      updates: {
        create: [
          { status: "INVESTIGATING", body: "We are investigating elevated error rates on the US REST API.", createdAt: daysAgo(12) },
          { status: "IDENTIFIED", body: "We've identified a faulty deploy as the root cause and are rolling it back.", createdAt: daysAgo(12) },
          { status: "MONITORING", body: "The rollback has completed. We are monitoring error rates.", createdAt: daysAgo(12) },
          { status: "RESOLVED", body: "Error rates have returned to normal. This incident is resolved.", createdAt: daysAgo(12) },
        ],
      },
    },
  });

  await prisma.incident.create({
    data: {
      pageId: appPage.id,
      name: "Push notifications delayed",
      status: "MONITORING",
      impact: "MINOR",
      createdAt: daysAgo(0),
      components: { create: [{ componentId: notifications.id, newStatus: "PARTIAL_OUTAGE" }] },
      updates: {
        create: [
          { status: "INVESTIGATING", body: "We're seeing delays in push notification delivery on Android and iOS.", createdAt: daysAgo(0) },
          { status: "IDENTIFIED", body: "Root cause identified as a backlog in our notification queue. Applying a fix.", createdAt: daysAgo(0) },
          { status: "MONITORING", body: "The queue backlog has been cleared. We're monitoring delivery times.", createdAt: daysAgo(0) },
        ],
      },
    },
  });

  await prisma.incident.create({
    data: {
      pageId: apiPage.id,
      name: "GraphQL API latency (EU)",
      status: "IDENTIFIED",
      impact: "MINOR",
      createdAt: daysAgo(0),
      components: { create: [{ componentId: graphqlUs.id, newStatus: "DEGRADED_PERFORMANCE" }] },
      updates: {
        create: [
          { status: "INVESTIGATING", body: "We are investigating increased latency on the EU GraphQL API.", createdAt: daysAgo(0) },
          { status: "IDENTIFIED", body: "A database connection pool exhaustion has been identified as the cause.", createdAt: daysAgo(0) },
        ],
      },
    },
  });

  // Scheduled maintenance
  const maintStart = new Date();
  maintStart.setDate(maintStart.getDate() + 2);
  const maintEnd = new Date(maintStart);
  maintEnd.setHours(maintEnd.getHours() + 3);
  await prisma.incident.create({
    data: {
      pageId: apiPage.id,
      name: "Scheduled database upgrade",
      status: "INVESTIGATING",
      impact: "NONE",
      isMaintenance: true,
      maintenanceStatus: "SCHEDULED",
      scheduledStart: maintStart,
      scheduledEnd: maintEnd,
      autoTransition: true,
      components: { create: [{ componentId: webhooksComp.id, newStatus: "UNDER_MAINTENANCE" }] },
      updates: {
        create: [
          {
            status: "INVESTIGATING",
            body: "We will be performing a scheduled database upgrade. Webhook delivery may be delayed during this window.",
            createdAt: new Date(),
          },
        ],
      },
    },
  });

  // Backfilled historical incident (no notifications)
  await prisma.incident.create({
    data: {
      pageId: appPage.id,
      name: "Website outage",
      status: "RESOLVED",
      impact: "CRITICAL",
      backfilled: true,
      notifySubscribers: false,
      createdAt: daysAgo(45),
      resolvedAt: daysAgo(45),
      components: { create: [{ componentId: website.id, newStatus: "MAJOR_OUTAGE" }] },
      updates: {
        create: [
          { status: "INVESTIGATING", body: "Investigating a full website outage.", createdAt: daysAgo(45) },
          { status: "RESOLVED", body: "Website restored after a CDN configuration rollback.", createdAt: daysAgo(45) },
        ],
      },
    },
  });

  // Published postmortem example
  await prisma.incident.update({
    where: { id: incident1.id },
    data: {
      postmortemBody:
        "## Summary\nA faulty deploy introduced a regression that caused elevated 500 errors on the US REST API for approximately 40 minutes.\n\n## Timeline\n- 14:02 UTC: Deploy shipped\n- 14:08 UTC: Error rate alerts fired, investigation began\n- 14:22 UTC: Root cause identified, rollback started\n- 14:40 UTC: Rollback complete, error rates normal\n\n## Root Cause\nAn unhandled null case in the request validation middleware caused a crash loop under specific payloads.\n\n## Remediation\nWe added regression tests for this payload shape and are adding canary deploys to catch similar issues before full rollout.",
      postmortemPublishedAt: daysAgo(11),
    },
  });

  // ---- Incident templates ----
  const tg = await prisma.templateGroup.create({ data: { pageId: apiPage.id, name: "Common Incidents" } });
  await prisma.incidentTemplate.createMany({
    data: [
      {
        pageId: apiPage.id,
        groupId: tg.id,
        title: "Elevated error rates",
        body: "We are investigating elevated error rates on {{component}}. We will provide updates as we learn more.",
        defaultStatus: "INVESTIGATING",
        defaultImpact: "MAJOR",
      },
      {
        pageId: apiPage.id,
        groupId: tg.id,
        title: "Increased latency",
        body: "We are seeing increased latency on {{component}} and are investigating the cause.",
        defaultStatus: "INVESTIGATING",
        defaultImpact: "MINOR",
      },
    ],
  });

  // ---- Metrics ----
  const respTime = await prisma.metric.create({
    data: { pageId: apiPage.id, componentId: restApiUs.id, name: "API Response Time", suffix: "ms", decimals: 0 },
  });
  const uptimeMetric = await prisma.metric.create({
    data: { pageId: apiPage.id, name: "Overall Uptime", suffix: "%", decimals: 2 },
  });
  const errorRate = await prisma.metric.create({
    data: { pageId: appPage.id, name: "Mobile Crash-Free Rate", suffix: "%", decimals: 2 },
  });

  const points: { metricId: string; timestamp: Date; value: number }[] = [];
  for (let h = 24 * 14; h >= 0; h--) {
    const ts = new Date();
    ts.setHours(ts.getHours() - h);
    points.push({ metricId: respTime.id, timestamp: ts, value: 80 + Math.random() * 40 + (h < 5 ? 100 : 0) });
    points.push({ metricId: uptimeMetric.id, timestamp: ts, value: 99.5 + Math.random() * 0.5 });
    points.push({ metricId: errorRate.id, timestamp: ts, value: 99 + Math.random() * 1 });
  }
  await prisma.metricPoint.createMany({ data: points });

  // ---- Subscribers ----
  await prisma.subscriber.createMany({
    data: [
      { pageId: apiPage.id, channel: "EMAIL", contact: "dev1@example.com", verified: true },
      { pageId: apiPage.id, channel: "EMAIL", contact: "dev2@example.com", verified: true, componentIds: JSON.stringify([restApiUs.id]) },
      { pageId: apiPage.id, channel: "SMS", contact: "+14155550100", verified: true },
      { pageId: apiPage.id, channel: "WEBHOOK", contact: "https://example.com/webhook-receiver", verified: true },
      { pageId: apiPage.id, channel: "EMAIL", contact: "bounced@example.com", verified: true, quarantined: true },
      { pageId: appPage.id, channel: "EMAIL", contact: "user1@example.com", verified: true },
      { pageId: appPage.id, channel: "EMAIL", contact: "pending@example.com", verified: false },
    ],
  });

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
    await prisma.$disconnect();
  });

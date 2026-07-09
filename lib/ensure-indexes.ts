import { collections } from "@/lib/db";

export async function ensureIndexes() {
  await Promise.all([
    collections.organizations().createIndex({ slug: 1 }, { unique: true }),
    collections.platformAdmins().createIndex({ email: 1 }, { unique: true }),
    collections.teamMembers().createIndex({ orgId: 1, email: 1 }, { unique: true }),
    collections.apiKeys().createIndex({ key: 1 }, { unique: true }),
    collections.pages().createIndex({ slug: 1 }, { unique: true }),
    collections
      .pages()
      .createIndex({ customDomain: 1 }, { unique: true, partialFilterExpression: { customDomain: { $type: "string" } } }),
    collections.pageAccessUsers().createIndex({ pageId: 1, email: 1 }, { unique: true }),
    collections.components().createIndex({ automationToken: 1 }, { unique: true }),
    collections.incidentComponents().createIndex({ incidentId: 1, componentId: 1 }, { unique: true }),
    collections.subscribers().createIndex({ unsubscribeToken: 1 }, { unique: true }),
    collections.subscribers().createIndex({ pageId: 1, channel: 1, contact: 1 }, { unique: true }),
    collections.componentStatusEvents().createIndex({ componentId: 1, startedAt: 1 }),
    collections.metricPoints().createIndex({ metricId: 1, timestamp: 1 }),
    collections.monitors().createIndex({ pageId: 1 }),
    collections.monitors().createIndex({ enabled: 1, lastCheckedAt: 1 }),
    collections.monitorChecks().createIndex({ monitorId: 1, checkedAt: -1 }),
  ]);
}

if (require.main === module) {
  ensureIndexes()
    .then(() => {
      console.log("Indexes ensured.");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

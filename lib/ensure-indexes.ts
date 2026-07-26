import { collections } from "@/lib/db";

function isMissingIndexOrCollection(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error.code === 26 || error.code === 27)
  );
}

export async function ensureIndexes() {
  // Email is profile/contact data, not an authentication identifier. Older
  // installations enforced uniqueness because login previously used email.
  try {
    await collections.users().dropIndex("canonicalEmail_1");
  } catch (error) {
    if (!isMissingIndexOrCollection(error)) throw error;
  }
  try {
    await collections.externalIdentities().dropIndex("connectionId_1_canonicalEmail_1");
  } catch (error) {
    if (!isMissingIndexOrCollection(error)) throw error;
  }
  // Legacy installations indexed the plaintext automation token uniquely.
  // Modern documents store only automationTokenHash; retaining the old index
  // rejects every new component that correctly omits the plaintext field.
  try {
    await collections.components().dropIndex("automationToken_1");
  } catch (error) {
    if (!isMissingIndexOrCollection(error)) {
      throw error;
    }
  }
  // Support sessions are immutable audit evidence. Expiry is enforced on
  // authorization, but records must not disappear from the operator timeline.
  try {
    await collections.supportSessions().dropIndex("expiresAt_1");
  } catch (error) {
    if (!isMissingIndexOrCollection(error)) {
      throw error;
    }
  }
  // Retention is organization-aware. A collection-wide TTL cannot represent
  // bounded organization overrides, so the worker owns monitor-history expiry.
  try {
    await collections.monitorChecks().dropIndex("checkedAt_1");
  } catch (error) {
    if (!isMissingIndexOrCollection(error)) throw error;
  }
  // Custom status-page domains were retired. Remove their legacy uniqueness
  // index when upgrading an existing installation.
  try {
    await collections.pages().dropIndex("customDomain_1");
  } catch (error) {
    if (!isMissingIndexOrCollection(error)) throw error;
  }

  await Promise.all([
    collections.organizations().createIndex({ slug: 1 }, { unique: true }),
    collections.organizations().createIndex({ status: 1, createdAt: -1 }),
    collections.platformAuditLogs().createIndex({ createdAt: -1 }),
    collections.platformAuditLogs().createIndex({ organizationId: 1, createdAt: -1 }),
    collections.platformAuditLogs().createIndex({ actorId: 1, createdAt: -1 }),
    collections.platformJobs().createIndex({ status: 1, nextAttemptAt: 1, leaseExpiresAt: 1 }),
    collections.platformJobs().createIndex({ organizationId: 1, createdAt: -1 }),
    collections.organizationTombstones().createIndex({ organizationId: 1 }, { unique: true }),
    collections.organizationTombstones().createIndex({ slug: 1, purgedAt: -1 }),
    collections.users().createIndex({ canonicalUsername: 1 }, { unique: true }),
    collections.users().createIndex({ canonicalEmail: 1 }, { name: "users_contact_email" }),
    collections
      .users()
      .createIndex(
        { oidcIssuer: 1, oidcSubject: 1 },
        {
          unique: true,
          partialFilterExpression: { oidcIssuer: { $type: "string" }, oidcSubject: { $type: "string" } },
        }
      ),
    collections.memberships().createIndex({ orgId: 1, userId: 1 }, { unique: true }),
    collections.memberships().createIndex({ userId: 1, createdAt: 1 }),
    collections.memberships().createIndex({ orgId: 1, status: 1 }),
    collections.memberships().createIndex({ pageIds: 1 }),
    collections.memberships().createIndex(
      { invitationTokenHash: 1 },
      {
        unique: true,
        partialFilterExpression: { invitationTokenHash: { $type: "string" } },
      }
    ),
    collections.authSessions().createIndex({ tokenHash: 1 }, { unique: true }),
    collections.authSessions().createIndex({ userId: 1, revokedAt: 1, lastSeenAt: -1 }),
    collections.authSessions().createIndex({ absoluteExpiresAt: 1 }, { expireAfterSeconds: 0 }),
    collections.identityConnections().createIndex({ slug: 1 }, { unique: true }),
    collections.identityConnections().createIndex({ audience: 1, orgId: 1, enabled: 1 }),
    collections.externalIdentities().createIndex(
      { connectionId: 1, subject: 1 },
      { unique: true }
    ),
    collections.externalIdentities().createIndex({ connectionId: 1, userId: 1 }),
    collections.scimTokens().createIndex({ tokenHash: 1 }, { unique: true }),
    collections.scimTokens().createIndex({ connectionId: 1, revokedAt: 1 }),
    collections.scimGroups().createIndex(
      { connectionId: 1, displayName: 1 },
      { unique: true }
    ),
    collections.samlRequests().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    collections.retentionPolicies().createIndex(
      { orgId: 1 },
      { unique: true }
    ),
    collections.dataExportJobs().createIndex({ status: 1, leaseExpiresAt: 1, createdAt: 1 }),
    collections.dataExportJobs().createIndex({ orgId: 1, createdAt: -1 }),
    collections.auditChainStates().createIndex({ updatedAt: 1 }),
    collections.auditSinks().createIndex({ orgId: 1, enabled: 1 }),
    collections.auditDeliveryJobs().createIndex({ deduplicationKey: 1 }, { unique: true }),
    collections.auditDeliveryJobs().createIndex({ status: 1, nextAttemptAt: 1, leaseExpiresAt: 1 }),
    collections.auditLogs().createIndex(
      { orgId: 1, chainSequence: 1 },
      { unique: true, partialFilterExpression: { chainSequence: { $type: "number" } } }
    ),
    collections.platformAuditLogs().createIndex(
      { chainSequence: 1 },
      { unique: true, partialFilterExpression: { chainSequence: { $type: "number" } } }
    ),
    collections.apiKeys().createIndex({ keyHash: 1 }, { unique: true }),
    collections.apiKeys().createIndex({ orgId: 1, revokedAt: 1, expiresAt: 1 }),
    collections.pages().createIndex({ slug: 1 }, { unique: true }),
    collections.pageDesignDrafts().createIndex({ pageId: 1 }, { unique: true }),
    collections.pageDesignVersions().createIndex({ pageId: 1, version: -1 }, { unique: true }),
    collections.pageAnnouncements().createIndex({ pageId: 1, startsAt: 1, endsAt: 1 }),
    collections.pageAccessUsers().createIndex({ pageId: 1, email: 1 }, { unique: true }),
    collections
      .components()
      .createIndex(
        { automationTokenHash: 1 },
        { unique: true, partialFilterExpression: { automationTokenHash: { $type: "string" } } }
      ),
    collections.incidentComponents().createIndex({ incidentId: 1, componentId: 1 }, { unique: true }),
    collections.incidents().createIndex({
      isMaintenance: 1,
      maintenanceStatus: 1,
      reminderSentAt: 1,
      scheduledStart: 1,
    }),
    collections.subscribers().createIndex({ unsubscribeToken: 1 }, { unique: true }),
    collections.subscribers().createIndex({ pageId: 1, channel: 1, contact: 1 }, { unique: true }),
    collections.componentStatusEvents().createIndex({ componentId: 1, startedAt: 1 }),
    collections
      .componentStatusEvents()
      .createIndex(
        { componentId: 1, endedAt: 1 },
        { unique: true, partialFilterExpression: { endedAt: null } }
      ),
    collections.metricPoints().createIndex({ metricId: 1, timestamp: 1 }),
    collections.monitors().createIndex({ pageId: 1 }),
    collections.monitors().createIndex({ enabled: 1, lastCheckedAt: 1 }),
    collections.monitors().createIndex(
      { heartbeatTokenHash: 1 },
      { unique: true, partialFilterExpression: { heartbeatTokenHash: { $type: "string" } } }
    ),
    collections.monitorChecks().createIndex({ monitorId: 1, checkedAt: -1 }),
    collections.monitorChecks().createIndex({ checkedAt: 1 }),
    collections.monitors().createIndex({ leaseExpiresAt: 1 }),
    collections.monitors().createIndex(
      { currentIncidentId: 1 },
      {
        partialFilterExpression: { currentIncidentId: { $type: "objectId" } },
      }
    ),
    collections.subscriptionOtps().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    collections.notificationJobs().createIndex({ deduplicationKey: 1 }, { unique: true }),
    collections.notificationJobs().createIndex({ status: 1, nextAttemptAt: 1, leaseExpiresAt: 1 }),
    collections.workerHeartbeats().createIndex({ workerId: 1 }, { unique: true }),
    collections.workerHeartbeats().createIndex({ lastSeenAt: 1 }),
    collections.feedTokens().createIndex({ tokenHash: 1 }, { unique: true }),
    collections.feedTokens().createIndex({ pageId: 1, revokedAt: 1 }),
    collections.rateLimits().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    collections.monitorTemplates().createIndex({ name: 1 }, { unique: true }),
    collections.assets().createIndex({ pageId: 1, kind: 1, deletedAt: 1 }),
    collections.assets().createIndex({ storageKey: 1 }, { unique: true }),
    collections.notificationDestinations().createIndex({ pageId: 1, channel: 1 }),
    collections.platformConfiguration().createIndex({ updatedAt: -1 }),
    collections.analyticsDaily().createIndex({ pageId: 1, date: -1 }),
    collections.analyticsDaily().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}

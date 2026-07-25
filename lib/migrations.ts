import { createHash } from "node:crypto";
import {
  ObjectId,
  type ClientSession,
  type Db,
  type Document,
  type MongoClient,
} from "mongodb";
import { db, mongoClient } from "@/lib/db";
import { canonicalizeEmail } from "@/lib/identity";
import { generateAutomationToken, generateWebhookSecret } from "@/lib/tokens";
import { hashSecret } from "@/lib/secrets";
import { encryptSecret } from "@/lib/encryption";
import { DEFAULT_MONITOR_TEMPLATES } from "@/lib/default-monitor-templates";
import {
  evaluateMigrationState,
  type MigrationInspection,
  type MigrationManifestEntry,
} from "@/lib/migration-state";

export {
  evaluateMigrationState,
  migrationIssueSummary,
  type MigrationInspection,
  type MigrationManifestEntry,
} from "@/lib/migration-state";

type Migration = {
  id: string;
  description: string;
  source: string;
  run: (database: Db, session: ClientSession) => Promise<void>;
};

function checksum(source: string) {
  return createHash("sha256").update(source).digest("hex");
}

function dateValue(value: unknown): Date {
  return value instanceof Date ? value : new Date(0);
}

const identityMigrationSource = `
users-and-memberships-v1
organization-contact-email-v1
hashed-api-component-webhook-otp-secrets-v2
incident-page-wide-v1
worker-lease-defaults-v1
`;

const monitorTemplateMigrationSource = `
curated-worker-monitor-templates-v1
`;

const experienceFoundationSource = `
five-scoped-roles-v1
membership-lifecycle-v1
page-theme-and-analytics-v1
unified-communication-templates-v1
notification-destinations-v1
`;

const operatorConsoleFoundationSource = `
platform-rbac-and-totp-v2-owner-backfill-and-email-preflight
organization-lifecycle-v1
durable-platform-audit-and-jobs-v1
support-view-operate-v1
maintenance-reminders-v1
notification-terminal-status-v1
`;

const legacyDemoCredentialCleanupSource = `
disable-known-legacy-platform-demo-admin-v1
disable-known-legacy-sample-users-v1
revoke-known-fixed-demo-api-key-v1
invalidate-known-sample-page-passwords-v1
`;

const enterpriseSecurityFoundationSource = `
database-backed-auth-sessions-v1
multi-connection-enterprise-identity-v1
scoped-api-credentials-v1
retention-and-export-jobs-v1
argon2-progressive-password-upgrade-v1
`;

async function productionFoundation(database: Db, session: ClientSession) {
  const legacyMembers = await database
    .collection("teamMembers")
    .find({}, { session })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();

  const byEmail = new Map<string, Document[]>();
  for (const member of legacyMembers) {
    const email = canonicalizeEmail(String(member.email ?? ""));
    if (!email) throw new Error(`Legacy team member ${String(member._id)} has no valid email`);
    const records = byEmail.get(email) ?? [];
    records.push(member);
    byEmail.set(email, records);
  }

  // Never guess which password represents a global identity. Perform this
  // validation before writing anything so the whole migration aborts cleanly.
  for (const [email, records] of byEmail) {
    const passwordHashes = new Set(
      records.map((record) => String(record.passwordHash ?? "")).filter(Boolean)
    );
    const existingUser = await database.collection("users").findOne({ canonicalEmail: email }, { session });
    if (existingUser?.passwordHash) passwordHashes.add(String(existingUser.passwordHash));
    if (passwordHashes.size > 1) {
      throw new Error(
        `Migration stopped: duplicate email ${email} has conflicting password records. ` +
          "Resolve the duplicate identities before retrying."
      );
    }
  }

  const userIdByEmail = new Map<string, ObjectId>();
  for (const [email, records] of byEmail) {
    const oldest = records.slice().sort((a, b) => {
      const byDate = dateValue(a.createdAt).getTime() - dateValue(b.createdAt).getTime();
      return byDate || String(a._id).localeCompare(String(b._id));
    })[0];
    const existing = await database.collection("users").findOne({ canonicalEmail: email }, { session });
    const userId = existing?._id instanceof ObjectId ? existing._id : new ObjectId();
    const now = new Date();
    await database.collection("users").updateOne(
      { _id: userId },
      {
        $set: {
          email: String(oldest.email).trim(),
          canonicalEmail: email,
          name: String(oldest.name ?? email),
          passwordHash: oldest.passwordHash
            ? String(oldest.passwordHash)
            : existing?.passwordHash
              ? String(existing.passwordHash)
              : null,
          twoFactorEnabled: Boolean(oldest.twoFactorEnabled),
          disabled: false,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: dateValue(oldest.createdAt).getTime() ? oldest.createdAt : now },
      },
      { upsert: true, session }
    );
    userIdByEmail.set(email, userId);
  }

  const membersByOrg = new Map<string, Document[]>();
  for (const member of legacyMembers) {
    const orgKey = String(member.orgId);
    const records = membersByOrg.get(orgKey) ?? [];
    records.push(member);
    membersByOrg.set(orgKey, records);
  }

  for (const records of membersByOrg.values()) {
    const admins = records
      .filter((record) => record.role === "TENANT_ADMIN")
      .sort((a, b) => {
        const byDate = dateValue(a.createdAt).getTime() - dateValue(b.createdAt).getTime();
        return byDate || String(a._id).localeCompare(String(b._id));
      });
    if (!admins.length) {
      throw new Error(
        `Migration stopped: organization ${String(records[0]?.orgId)} has no legacy tenant administrator to promote to Owner`
      );
    }
    const ownerEmail = admins[0] ? canonicalizeEmail(String(admins[0].email)) : null;
    const recordsByEmail = new Map<string, Document[]>();
    for (const member of records) {
      const email = canonicalizeEmail(String(member.email ?? ""));
      const emailRecords = recordsByEmail.get(email) ?? [];
      emailRecords.push(member);
      recordsByEmail.set(email, emailRecords);
    }

    for (const [email, emailRecords] of recordsByEmail) {
      const member = emailRecords[0];
      const userId = userIdByEmail.get(email);
      if (!userId || !(member.orgId instanceof ObjectId)) continue;
      const isAdmin = emailRecords.some((record) => record.role === "TENANT_ADMIN");
      const role = email === ownerEmail ? "OWNER" : isAdmin ? "ADMIN" : "RESPONDER";
      const oldestMembership = emailRecords.slice().sort((a, b) => {
        const byDate = dateValue(a.createdAt).getTime() - dateValue(b.createdAt).getTime();
        return byDate || String(a._id).localeCompare(String(b._id));
      })[0];
      await database.collection("memberships").updateOne(
        { orgId: member.orgId, userId },
        {
          $set: { role },
          $setOnInsert: {
            _id: new ObjectId(),
            createdAt: dateValue(oldestMembership.createdAt).getTime()
              ? oldestMembership.createdAt
              : new Date(),
          },
        },
        { upsert: true, session }
      );
    }
  }

  const organizations = await database.collection("organizations").find({}, { session }).toArray();
  for (const organization of organizations) {
    const contactEmail =
      typeof organization.contactEmail === "string"
        ? organization.contactEmail
        : typeof organization.billingEmail === "string"
          ? organization.billingEmail
          : null;
    await database.collection("organizations").updateOne(
      { _id: organization._id },
      {
        $set: { contactEmail },
        $unset: { plan: "", planRenewsAt: "", billingEmail: "" },
      },
      { session }
    );
  }
  await database
    .collection("pages")
    .updateMany({ customDomain: "" }, { $set: { customDomain: null } }, { session });

  const apiKeys = await database.collection("apiKeys").find({}, { session }).toArray();
  for (const key of apiKeys) {
    if (typeof key.key !== "string" || !key.key) continue;
    await database.collection("apiKeys").updateOne(
      { _id: key._id },
      {
        $set: {
          keyHash: hashSecret(key.key),
          prefix: key.key.slice(0, 20),
          lastFour: key.key.slice(-4),
          revokedAt: null,
        },
        $unset: { key: "" },
      },
      { session }
    );
  }

  const components = await database.collection("components").find({}, { session }).toArray();
  const activeIncidentIds = (
    await database
      .collection("incidents")
      .find(
        {
          $or: [
            { isMaintenance: { $ne: true }, status: { $ne: "RESOLVED" } },
            { isMaintenance: true, maintenanceStatus: { $in: ["IN_PROGRESS", "VERIFYING"] } },
          ],
        },
        { session, projection: { _id: 1 } }
      )
      .toArray()
  ).map((incident) => incident._id);
  const activeComponentIds = new Set(
    activeIncidentIds.length
      ? (
          await database
            .collection("incidentComponents")
            .find({ incidentId: { $in: activeIncidentIds } }, { session, projection: { componentId: 1 } })
            .toArray()
        ).map((link) => String(link.componentId))
      : []
  );
  for (const component of components) {
    const generated = generateAutomationToken();
    const legacyToken = typeof component.automationToken === "string" ? component.automationToken : null;
    const existingTokenHash =
      typeof component.automationTokenHash === "string" ? component.automationTokenHash : null;
    await database.collection("components").updateOne(
      { _id: component._id },
      {
        $set: {
          manualStatus: activeComponentIds.has(String(component._id))
            ? "OPERATIONAL"
            : String(component.manualStatus ?? component.status ?? "OPERATIONAL"),
          automationTokenHash: existingTokenHash ?? (legacyToken ? hashSecret(legacyToken) : generated.hash),
          automationTokenPrefix:
            typeof component.automationTokenPrefix === "string"
              ? component.automationTokenPrefix
              : legacyToken
                ? legacyToken.slice(0, 12)
                : generated.prefix,
          automationTokenLastFour:
            typeof component.automationTokenLastFour === "string"
              ? component.automationTokenLastFour
              : legacyToken
                ? legacyToken.slice(-4)
                : generated.lastFour,
        },
        $unset: { automationToken: "" },
      },
      { session }
    );
  }

  const endpoints = await database.collection("webhookEndpoints").find({}, { session }).toArray();
  for (const endpoint of endpoints) {
    if (endpoint.secretHash) {
      await database.collection("webhookEndpoints").updateOne(
        { _id: endpoint._id },
        {
          $set: {
            active: Boolean(endpoint.active && endpoint.verifiedAt && endpoint.secretCiphertext),
          },
          $unset: { secret: "" },
        },
        { session }
      );
      continue;
    }
    const generated = generateWebhookSecret();
    const legacySecret = typeof endpoint.secret === "string" ? endpoint.secret : null;
    const verifiedAt = endpoint.verifiedAt instanceof Date ? endpoint.verifiedAt : null;
    await database.collection("webhookEndpoints").updateOne(
      { _id: endpoint._id },
      {
        $set: {
          secretHash: legacySecret ? hashSecret(legacySecret) : generated.hash,
          secretCiphertext: encryptSecret(legacySecret ?? generated.token),
          secretPrefix: legacySecret ? legacySecret.slice(0, 10) : generated.prefix,
          secretLastFour: legacySecret ? legacySecret.slice(-4) : generated.lastFour,
          active: Boolean(endpoint.active && verifiedAt && legacySecret),
          verifiedAt,
          verificationTokenHash: null,
        },
        $unset: { secret: "" },
      },
      { session }
    );
  }

  const otps = await database.collection("subscriptionOtps").find({}, { session }).toArray();
  for (const otp of otps) {
    if (typeof otp.code !== "string") continue;
    await database.collection("subscriptionOtps").updateOne(
      { _id: otp._id },
      { $set: { codeHash: hashSecret(otp.code), attempts: 0 }, $unset: { code: "" } },
      { session }
    );
  }

  const incidents = await database.collection("incidents").find({}, { session }).toArray();
  for (const incident of incidents) {
    if (typeof incident.pageWide === "boolean") continue;
    const links = await database
      .collection("incidentComponents")
      .countDocuments({ incidentId: incident._id }, { session });
    await database
      .collection("incidents")
      .updateOne({ _id: incident._id }, { $set: { pageWide: links === 0 } }, { session });
  }

  for (const component of components) {
    const openEvents = await database
      .collection("componentStatusEvents")
      .find({ componentId: component._id, endedAt: null }, { session })
      .sort({ startedAt: -1, _id: -1 })
      .toArray();
    if (openEvents.length === 0) {
      await database.collection("componentStatusEvents").insertOne(
        {
          _id: new ObjectId(),
          componentId: component._id,
          status: String(component.status ?? "OPERATIONAL"),
          startedAt: dateValue(component.createdAt).getTime() ? component.createdAt : new Date(),
          endedAt: null,
          isMaintenance: component.status === "UNDER_MAINTENANCE",
        },
        { session }
      );
    } else if (openEvents.length > 1) {
      const keepId = openEvents[0]._id;
      await database.collection("componentStatusEvents").updateMany(
        { componentId: component._id, endedAt: null, _id: { $ne: keepId } },
        { $set: { endedAt: openEvents[0].startedAt ?? new Date() } },
        { session }
      );
    }
  }

  await database.collection("monitors").updateMany(
    {},
    [
      {
        $set: {
          isDown: {
            $and: [
              { $eq: ["$lastOk", false] },
              { $gte: ["$consecutiveFails", { $ifNull: ["$failThreshold", 1] }] },
            ],
          },
          leaseOwner: null,
          leaseExpiresAt: null,
          runRequestedAt: null,
        },
      },
    ],
    { session }
  );
  const legacyMonitorSecrets = await database
    .collection("monitors")
    .find({ authSecret: { $type: "string", $ne: "" } }, { session })
    .toArray();
  for (const monitor of legacyMonitorSecrets) {
    const value = String(monitor.authSecret);
    if (value.split(".").length === 3) continue;
    await database
      .collection("monitors")
      .updateOne({ _id: monitor._id }, { $set: { authSecret: encryptSecret(value) } }, { session });
  }
}

const migrations: Migration[] = [
  {
    id: "001-production-foundation",
    description: "Create global identities and production job/security fields",
    source: identityMigrationSource,
    run: productionFoundation,
  },
  {
    id: "002-curated-monitor-templates",
    description: "Install editable worker-backed monitor templates",
    source: monitorTemplateMigrationSource,
    run: async (database, session) => {
      for (const template of DEFAULT_MONITOR_TEMPLATES) {
        await database.collection("monitorTemplates").updateOne(
          { name: template.name },
          {
            $setOnInsert: {
              _id: new ObjectId(),
              ...template,
            },
          },
          { upsert: true, session }
        );
      }
    },
  },
  {
    id: "003-experience-foundation",
    description: "Add scoped roles, themes, unified templates, and notification destinations",
    source: experienceFoundationSource,
    run: async (database, session) => {
      const now = new Date();
      await database.collection("users").updateMany(
        { mustChangePassword: { $exists: false } },
        { $set: { mustChangePassword: false } },
        { session }
      );
      await database.collection("memberships").updateMany(
        { status: { $exists: false } },
        {
          $set: {
            status: "ACTIVE",
            pageIds: null,
            invitationExpiresAt: null,
            activatedAt: now,
          },
        },
        { session }
      );
      await database.collection("pages").updateMany(
        {},
        [
          {
            $set: {
              themePreset: { $ifNull: ["$themePreset", "SIGNAL"] },
              themeMode: { $ifNull: ["$themeMode", "SYSTEM"] },
              allowThemeOverride: { $ifNull: ["$allowThemeOverride", true] },
              analyticsEnabled: {
                $ifNull: ["$analyticsEnabled", { $eq: ["$type", "PUBLIC"] }],
              },
            },
          },
        ],
        { session }
      );
      await database.collection("incidentTemplates").updateMany(
        {},
        [
          {
            $set: {
              kind: { $ifNull: ["$kind", "INCIDENT"] },
              variables: { $ifNull: ["$variables", []] },
              notifyByDefault: { $ifNull: ["$notifyByDefault", true] },
              archivedAt: { $ifNull: ["$archivedAt", null] },
              updatedAt: { $ifNull: ["$updatedAt", "$createdAt"] },
            },
          },
        ],
        { session }
      );
      await database.collection("notificationJobs").updateMany(
        { destinationId: { $exists: false } },
        { $set: { destinationId: null } },
        { session }
      );

      const integrationSubscribers = await database
        .collection("subscribers")
        .find({ channel: { $in: ["SLACK", "MICROSOFT_TEAMS"] } }, { session })
        .toArray();
      for (const subscriber of integrationSubscribers) {
        const channel = String(subscriber.channel);
        const contact = String(subscriber.contact ?? "");
        if (!contact) continue;
        await database.collection("notificationDestinations").updateOne(
          { pageId: subscriber.pageId, channel, legacySubscriberId: subscriber._id },
          {
            $setOnInsert: {
              _id: new ObjectId(),
              pageId: subscriber.pageId,
              name: channel === "SLACK" ? "Slack channel" : "Microsoft Teams channel",
              channel,
              configCiphertext: encryptSecret(JSON.stringify({ url: contact })),
              active: Boolean(subscriber.verified && !subscriber.quarantined),
              verifiedAt: subscriber.verified ? now : null,
              lastTestedAt: null,
              lastTestOk: null,
              lastError: null,
              eventTypes: [],
              componentIds: null,
              legacySubscriberId: subscriber._id,
              createdAt: subscriber.createdAt ?? now,
            },
          },
          { upsert: true, session }
        );
      }
    },
  },
  {
    id: "004-operator-console-foundation",
    description: "Add platform RBAC, MFA, organization lifecycle, and durable operations",
    source: operatorConsoleFoundationSource,
    run: async (database, session) => {
      const now = new Date();
      await database.collection("organizations").updateMany(
        {},
        [
          {
            $set: {
              status: {
                $ifNull: [
                  "$status",
                  { $cond: [{ $eq: ["$suspended", true] }, "SUSPENDED", "ACTIVE"] },
                ],
              },
              statusReason: { $ifNull: ["$statusReason", null] },
              statusChangedAt: { $ifNull: ["$statusChangedAt", "$createdAt"] },
              statusChangedBy: { $ifNull: ["$statusChangedBy", null] },
              updatedAt: { $ifNull: ["$updatedAt", "$createdAt"] },
            },
          },
        ],
        { session }
      );

      const platformAdmins = await database
        .collection("platformAdmins")
        .find({}, { session })
        .sort({ createdAt: 1, _id: 1 })
        .toArray();
      const platformAdminsByEmail = new Map<string, Document[]>();
      for (const admin of platformAdmins) {
        const email = canonicalizeEmail(String(admin.email ?? ""));
        if (!email) {
          throw new Error(`Platform administrator ${String(admin._id)} has no valid email`);
        }
        const records = platformAdminsByEmail.get(email) ?? [];
        records.push(admin);
        platformAdminsByEmail.set(email, records);
      }
      for (const [email, records] of platformAdminsByEmail) {
        if (records.length > 1) {
          throw new Error(
            `Migration stopped: platform administrator email ${email} has ${records.length} case-insensitive duplicates`
          );
        }
      }
      for (const admin of platformAdmins) {
        const email = canonicalizeEmail(String(admin.email ?? ""));
        await database.collection("platformAdmins").updateOne(
          { _id: admin._id },
          {
            $set: {
              canonicalEmail: email,
              // Existing platform administrators predate role separation and
              // retain full ownership until an Owner explicitly delegates them.
              role: admin.role ?? "OWNER",
              status: admin.status ?? "ACTIVE",
              sessionVersion: admin.sessionVersion ?? 1,
              totpSecretCiphertext: admin.totpSecretCiphertext ?? null,
              pendingTotpSecretCiphertext: admin.pendingTotpSecretCiphertext ?? null,
              recoveryCodeHashes: admin.recoveryCodeHashes ?? [],
              mfaEnrolledAt: admin.mfaEnrolledAt ?? null,
              lastLoginAt: admin.lastLoginAt ?? null,
              disabledAt: admin.disabledAt ?? null,
              disabledBy: admin.disabledBy ?? null,
              updatedAt: admin.updatedAt ?? admin.createdAt ?? now,
            },
          },
          { session }
        );
      }

      await database.collection("supportSessions").updateMany(
        {},
        [
          {
            $set: {
              mode: { $ifNull: ["$mode", "VIEW"] },
              scopes: { $ifNull: ["$scopes", []] },
              revokedBy: { $ifNull: ["$revokedBy", null] },
              revokedReason: { $ifNull: ["$revokedReason", null] },
              endedAt: { $ifNull: ["$endedAt", "$revokedAt"] },
            },
          },
        ],
        { session }
      );
      await database.collection("incidents").updateMany(
        { isMaintenance: true, reminderMinutesBefore: { $exists: false } },
        // Do not retroactively notify legacy windows. New maintenance defaults
        // to 60 minutes in the domain input schema.
        { $set: { reminderMinutesBefore: null, reminderSentAt: null } },
        { session }
      );
      await database.collection("metrics").updateMany(
        { decimals: { $exists: false } },
        { $set: { decimals: 0 } },
        { session }
      );
      await database.collection("notificationJobs").updateMany(
        { status: "FAILED", $expr: { $gte: ["$attempts", "$maxAttempts"] } },
        { $set: { status: "DEAD_LETTER", leaseOwner: null, leaseExpiresAt: null } },
        { session }
      );
      await database.collection("notificationJobs").updateMany(
        { status: "FAILED", $expr: { $lt: ["$attempts", "$maxAttempts"] } },
        { $set: { status: "PENDING", leaseOwner: null, leaseExpiresAt: null } },
        { session }
      );
      await database.collection("workerHeartbeats").updateMany(
        {},
        { $set: { lastLoopAt: null, lastError: null } },
        { session }
      );
    },
  },
  {
    id: "005-remove-legacy-demo-credentials",
    description: "Disable credentials created by legacy public sample-data seeds",
    source: legacyDemoCredentialCleanupSource,
    run: async (database, session) => {
      const now = new Date();
      const legacyPlatformEmails = [
        "platform@statuspage.test",
        "platform@signal.test",
      ];
      await database.collection("platformAdmins").updateMany(
        {
          canonicalEmail: { $in: legacyPlatformEmails },
          name: "Priya Platform",
        },
        {
          $set: {
            status: "DISABLED",
            disabledAt: now,
            disabledBy: null,
            updatedAt: now,
          },
          $inc: { sessionVersion: 1 },
        },
        { session }
      );

      const legacyUserEmails = [
        "admin@acme.test",
        "editor@acme.test",
        "admin2@acme.test",
        "responder@acme.test",
        "admin@globex.test",
        "editor@globex.test",
        "admin2@globex.test",
        "responder@globex.test",
      ];
      await database.collection("users").updateMany(
        { canonicalEmail: { $in: legacyUserEmails } },
        { $set: { disabled: true, passwordHash: null, updatedAt: now } },
        { session }
      );
      await database.collection("teamMembers").updateMany(
        { email: { $in: legacyUserEmails } },
        { $set: { passwordHash: null, disabled: true } },
        { session }
      );

      const fixedApiKey = "sp_live_demo_1234567890abcdef1234567890ab";
      await database.collection("apiKeys").updateMany(
        {
          $or: [
            { keyHash: hashSecret(fixedApiKey) },
            { key: fixedApiKey },
            { prefix: fixedApiKey.slice(0, 20) },
          ],
        },
        {
          $set: { revokedAt: now },
          $unset: { key: "" },
        },
        { session }
      );
      await database.collection("pages").updateMany(
        { slug: "internal-tools", type: "PRIVATE" },
        { $set: { passwordHash: "!legacy-demo-password-disabled!" } },
        { session }
      );
      await database.collection("pageAccessUsers").updateMany(
        {
          email: {
            $in: ["customerA@example.com", "customerB@example.com"],
          },
        },
        { $set: { passwordHash: "!legacy-demo-password-disabled!" } },
        { session }
      );
      await database.collection("platformAuditLogs").insertOne(
        {
          _id: new ObjectId(),
          actorId: null,
          actorEmail: "system@status",
          actorRole: "SYSTEM",
          action: "LEGACY_DEMO_CREDENTIALS_DISABLED",
          targetType: "installation",
          targetId: "legacy-demo-seed",
          organizationId: null,
          reason: "Removed credentials published by the legacy sample-data workflow",
          metadata: {
            platformEmails: legacyPlatformEmails,
            userEmails: legacyUserEmails,
            fixedApiKeyRevoked: true,
          },
          createdAt: now,
        },
        { session }
      );
    },
  },
  {
    id: "006-enterprise-security-foundation",
    description: "Add revocable sessions, enterprise identity, scoped credentials, and retention",
    source: enterpriseSecurityFoundationSource,
    run: async (database, session) => {
      const now = new Date();
      await database.collection("users").updateMany(
        {},
        [
          {
            $set: {
              sessionVersion: { $ifNull: ["$sessionVersion", 1] },
              mfaRequired: { $ifNull: ["$mfaRequired", false] },
              totpSecretCiphertext: { $ifNull: ["$totpSecretCiphertext", null] },
              pendingTotpSecretCiphertext: {
                $ifNull: ["$pendingTotpSecretCiphertext", null],
              },
              recoveryCodeHashes: { $ifNull: ["$recoveryCodeHashes", []] },
              mfaEnrolledAt: { $ifNull: ["$mfaEnrolledAt", null] },
            },
          },
        ],
        { session }
      );
      await database.collection("apiKeys").updateMany(
        { scopes: { $exists: false } },
        {
          $set: {
            scopes: [
              "status.read",
              "components.read",
              "components.write",
              "incidents.read",
              "incidents.write",
              "metrics.read",
              "metrics.write",
              "analytics.read",
            ],
            pageIds: null,
            expiresAt: null,
            allowedCidrs: null,
            createdBy: null,
            legacyFullAccess: true,
          },
        },
        { session }
      );
      await database.collection("retentionPolicies").updateOne(
        { orgId: null },
        {
          $setOnInsert: {
            _id: new ObjectId(),
            orgId: null,
            monitorChecksDays: 90,
            analyticsDays: 395,
            notificationLogsDays: 90,
            resolvedIncidentsDays: 730,
            auditLogsDays: 2555,
            createdAt: now,
            updatedAt: now,
            updatedBy: new ObjectId("000000000000000000000000"),
          },
        },
        { upsert: true, session }
      );
    },
  },
];

export const MIGRATION_MANIFEST: readonly MigrationManifestEntry[] = migrations.map(
  (migration) => ({
    id: migration.id,
    description: migration.description,
    checksum: checksum(migration.source),
  })
);

export const LATEST_MIGRATION_ID = MIGRATION_MANIFEST.at(-1)!.id;

export async function inspectMigrationState(database: Db = db): Promise<MigrationInspection> {
  const appliedMigrations = await database
    .collection<{ _id: string; checksum: string }>("migrations")
    .find({}, { projection: { checksum: 1 } })
    .toArray();
  return evaluateMigrationState(appliedMigrations, MIGRATION_MANIFEST);
}

export async function runMigrations(database = db, client: MongoClient = mongoClient) {
  const migrationRecords = database.collection<{
    _id: string;
    description: string;
    checksum: string;
    appliedAt: Date;
  }>("migrations");
  for (const migration of migrations) {
    const expectedChecksum = checksum(migration.source);
    const applied = await migrationRecords.findOne({ _id: migration.id });
    if (applied) {
      if (applied.checksum !== expectedChecksum) {
        throw new Error(`Applied migration ${migration.id} has an unexpected checksum`);
      }
      continue;
    }

    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const raced = await migrationRecords.findOne({ _id: migration.id }, { session });
        if (raced) return;
        await migration.run(database, session);
        await migrationRecords.insertOne(
          {
            _id: migration.id,
            description: migration.description,
            checksum: expectedChecksum,
            appliedAt: new Date(),
          },
          { session }
        );
      });
    } catch (error) {
      const duplicateKey =
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        error.code === 11000;
      const raced = duplicateKey ? await migrationRecords.findOne({ _id: migration.id }) : null;
      if (!raced || raced.checksum !== expectedChecksum) throw error;
    } finally {
      await session.endSession();
    }
  }
}

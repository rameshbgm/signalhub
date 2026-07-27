import { MongoClient, ObjectId, type Db } from "mongodb";
import type { StatusPageDesign } from "@/lib/page-design";

const globalForMongo = globalThis as unknown as { mongoClient?: MongoClient; mongoDb?: Db };

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = new MongoClient(url);
  const db = client.db();
  return { client, db };
}

if (!globalForMongo.mongoClient) {
  const { client, db } = connect();
  globalForMongo.mongoClient = client;
  globalForMongo.mongoDb = db;
}

export const mongoClient = globalForMongo.mongoClient!;
export const db = globalForMongo.mongoDb!;

// ---------- Document shapes ----------
// Plain interfaces only — nothing here is enforced at write time. Add or
// change a field on any document without touching these; they exist purely
// to make call sites easier to read and typo-check.

export type OrganizationStatus = "PROVISIONING" | "ACTIVE" | "SUSPENDED" | "DELETING";

export interface OrganizationDoc {
  _id: ObjectId;
  name: string;
  slug: string;
  contactEmail?: string | null;
  /** `suspended` is retained while older installations migrate to `status`. */
  suspended?: boolean;
  status?: OrganizationStatus;
  statusReason?: string | null;
  statusChangedAt?: Date | null;
  statusChangedBy?: ObjectId | null;
  /**
   * Incremented by tenant mutations inside their MongoDB transaction.
   * This is a write-conflict fence against lifecycle transitions and purge.
   */
  mutationRevision?: number;
  createdAt: Date;
  updatedAt?: Date;
}

/** @deprecated Transitional shape for pre-009 data; no runtime identity uses it. */
export type PlatformRole = "ADMIN";
export type PlatformAdminStatus = "ACTIVE" | "DISABLED";

export interface PlatformAdminDoc {
  _id: ObjectId;
  email: string;
  canonicalEmail?: string;
  passwordHash: string;
  name: string;
  role?: PlatformRole;
  /** Legacy singleton marker retained only so migration 009 can remove it. */
  singletonKey?: "platform-owner";
  status?: PlatformAdminStatus;
  sessionVersion?: number;
  totpSecretCiphertext?: string | null;
  pendingTotpSecretCiphertext?: string | null;
  recoveryCodeHashes?: string[];
  mfaEnrolledAt?: Date | null;
  lastLoginAt?: Date | null;
  disabledAt?: Date | null;
  disabledBy?: ObjectId | null;
  createdAt: Date;
  updatedAt?: Date;
}

export interface UserDoc {
  _id: ObjectId;
  username: string;
  canonicalUsername: string;
  email: string;
  canonicalEmail: string;
  passwordHash: string | null;
  name: string;
  twoFactorEnabled: boolean;
  oidcIssuer?: string | null;
  oidcSubject?: string | null;
  disabled?: boolean;
  mustChangePassword?: boolean;
  mustCompleteProfile?: boolean;
  sessionVersion?: number;
  mfaRequired?: boolean;
  totpSecretCiphertext?: string | null;
  pendingTotpSecretCiphertext?: string | null;
  recoveryCodeHashes?: string[];
  mfaEnrolledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type MembershipRole =
  | "ADMIN"
  | "INCIDENT_MANAGER"
  | "RESPONDER"
  | "VIEWER";

export interface MembershipDoc {
  _id: ObjectId;
  orgId: ObjectId;
  userId: ObjectId;
  role: MembershipRole;
  status?: "INVITED" | "ACTIVE" | "REVOKED";
  pageIds?: ObjectId[] | null;
  invitationExpiresAt?: Date | null;
  invitationTokenHash?: string | null;
  activatedAt?: Date | null;
  createdAt: Date;
}

export interface SupportSessionDoc {
  _id: ObjectId;
  platformAdminId: ObjectId;
  orgId: ObjectId;
  reason: string;
  mode?: "VIEW" | "OPERATE";
  scopes?: string[];
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedBy?: ObjectId | null;
  revokedReason?: string | null;
  endedAt?: Date | null;
  createdAt: Date;
}

export interface PlatformInviteDoc {
  _id: ObjectId;
  email: string;
  canonicalEmail: string;
  name: string;
  role: PlatformRole;
  tokenHash: string;
  createdBy: ObjectId;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface PlatformAuditLogDoc {
  _id: ObjectId;
  actorId: ObjectId | null;
  actorEmail: string;
  actorRole: PlatformRole | "SYSTEM";
  action: string;
  targetType: string;
  targetId: string;
  organizationId?: ObjectId | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  previousHash?: string | null;
  entryHash?: string | null;
  chainSequence?: number | null;
  createdAt: Date;
}

type PlatformJobStatus =
  | "QUEUED"
  | "PROCESSING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export interface OrganizationPurgeScopeDoc {
  pageIds: ObjectId[];
  componentIds: ObjectId[];
  incidentIds: ObjectId[];
  metricIds: ObjectId[];
  monitorIds: ObjectId[];
}

export interface PlatformJobDoc {
  _id: ObjectId;
  type: "PURGE_ORGANIZATION";
  status: PlatformJobStatus;
  organizationId: ObjectId;
  organizationSlug: string;
  organizationName: string;
  requestedBy: ObjectId;
  reason: string;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  /** Durable descendant keys allow an interrupted/legacy purge to resume even if roots disappeared. */
  purgeScope?: OrganizationPurgeScopeDoc;
}

export interface OrganizationTombstoneDoc {
  _id: ObjectId;
  organizationId: ObjectId;
  slug: string;
  name: string;
  requestedBy: ObjectId;
  reason: string;
  purgedAt: Date;
  /** Retained for fixed-point repair of any abnormally late legacy writer. */
  purgeScope?: OrganizationPurgeScopeDoc;
}

export interface ApiKeyDoc {
  _id: ObjectId;
  orgId: ObjectId;
  name: string;
  keyHash: string;
  prefix: string;
  lastFour: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdBy?: ObjectId | null;
  scopes?: ApiKeyScope[];
  pageIds?: ObjectId[] | null;
  expiresAt?: Date | null;
  allowedCidrs?: string[] | null;
  legacyFullAccess?: boolean;
}

export type ApiKeyScope =
  | "status.read"
  | "components.read"
  | "components.write"
  | "incidents.read"
  | "incidents.write"
  | "metrics.read"
  | "metrics.write"
  | "analytics.read";

export interface AuditLogDoc {
  _id: ObjectId;
  orgId: ObjectId;
  actor: string;
  action: string;
  target: string;
  metadata?: Record<string, unknown> | null;
  supportSessionId?: ObjectId | null;
  requestId?: string | null;
  sourceIp?: string | null;
  userAgent?: string | null;
  outcome?: "SUCCESS" | "FAILURE";
  previousHash?: string | null;
  entryHash?: string | null;
  chainSequence?: number | null;
  createdAt: Date;
}

type IdentityConnectionType = "OIDC" | "SAML";
type IdentityConnectionAudience = "ORGANIZATION" | "PLATFORM";

export interface IdentityRoleMapping {
  group: string;
  role: MembershipRole | PlatformRole;
  pageIds?: ObjectId[] | null;
}

export interface IdentityConnectionDoc {
  _id: ObjectId;
  name: string;
  slug: string;
  type: IdentityConnectionType;
  audience: IdentityConnectionAudience;
  orgId: ObjectId | null;
  enabled: boolean;
  configCiphertext: string;
  roleMappings: IdentityRoleMapping[];
  defaultRole?: MembershipRole | PlatformRole | null;
  acceptedAcrValues?: string[];
  acceptedAmrValues?: string[];
  allowJitProvisioning: boolean;
  lastTestedAt: Date | null;
  lastTestOk: boolean | null;
  lastError: string | null;
  createdBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExternalIdentityDoc {
  _id: ObjectId;
  connectionId: ObjectId;
  userId?: ObjectId | null;
  platformAdminId?: ObjectId | null;
  subject: string;
  canonicalEmail: string;
  groups: string[];
  version?: number;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthSessionDoc {
  _id: ObjectId;
  kind: "TENANT" | "PLATFORM";
  tokenHash: string;
  userId?: ObjectId | null;
  membershipId?: ObjectId | null;
  orgId?: ObjectId | null;
  platformAdminId?: ObjectId | null;
  sessionVersion: number;
  authMethod: "PASSWORD" | "OIDC" | "SAML" | "SUPPORT";
  mfaVerified: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
}

export interface ScimTokenDoc {
  _id: ObjectId;
  connectionId: ObjectId;
  tokenHash: string;
  prefix: string;
  lastFour: string;
  createdBy: ObjectId;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export interface ScimGroupDoc {
  _id: ObjectId;
  connectionId: ObjectId;
  externalId: string | null;
  displayName: string;
  memberExternalIds: string[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SamlRequestDoc {
  _id: string;
  value: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface RetentionPolicyDoc {
  _id: ObjectId;
  orgId: ObjectId | null;
  monitorChecksDays: number;
  analyticsDays: number;
  notificationLogsDays: number;
  resolvedIncidentsDays: number;
  auditLogsDays: number;
  createdAt: Date;
  updatedAt: Date;
  updatedBy: ObjectId;
}

export interface DataExportJobDoc {
  _id: ObjectId;
  orgId: ObjectId;
  status: "QUEUED" | "PROCESSING" | "SUCCEEDED" | "FAILED";
  requestedBy: ObjectId;
  storageKey: string | null;
  storageDriver?: "LOCAL" | "S3" | null;
  checksum: string | null;
  attempts: number;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface AuditChainStateDoc {
  _id: string;
  latestHash: string | null;
  sequence: number;
  retainedSequence?: number;
  retainedPreviousHash?: string | null;
  updatedAt: Date;
}

export interface AuditSinkDoc {
  _id: ObjectId;
  name: string;
  orgId: ObjectId | null;
  url: string;
  secretCiphertext: string;
  enabled: boolean;
  createdBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditDeliveryJobDoc {
  _id: ObjectId;
  sinkId: ObjectId;
  deduplicationKey: string;
  payload: Record<string, unknown>;
  status: "PENDING" | "PROCESSING" | "SENT" | "DEAD_LETTER";
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  lastError: string | null;
  responseStatus: number | null;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
}

export interface PageDoc {
  _id: ObjectId;
  orgId: ObjectId;
  name: string;
  slug: string;
  type: string; // PUBLIC, PRIVATE, AUDIENCE
  isHub: boolean;
  hubParentId: ObjectId | null;
  timezone: string;
  language: string;
  headline: string;
  aboutText: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  coverImageUrl: string | null;
  coverImageFit?: "COVER" | "CONTAIN";
  coverImagePositionX?: number;
  coverImagePositionY?: number;
  coverImageCropX?: number | null;
  coverImageCropY?: number | null;
  coverImageCropWidth?: number | null;
  coverImageCropHeight?: number | null;
  brandColor: string;
  layout: string; // STANDARD, COVER, MINIMAL
  supportUrl: string | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  passwordHash: string | null;
  removeBranding: boolean;
  customCss: string | null;
  themePreset?: string;
  themeMode?: "SYSTEM" | "LIGHT" | "DARK";
  allowThemeOverride?: boolean;
  analyticsEnabled?: boolean;
  publishedDesign?: StatusPageDesign;
  publishedDesignVersion?: number;
  designPublishedAt?: Date | null;
  /** Missing on legacy records means visible. */
  publicVisible?: boolean;
  /** A date marks a recoverable soft deletion; null/missing means active. */
  deletedAt?: Date | null;
  deletedBy?: ObjectId | null;
  createdAt: Date;
}

export interface PageDesignDraftDoc {
  _id: ObjectId;
  pageId: ObjectId;
  revision: number;
  basePublishedVersion: number;
  design: StatusPageDesign;
  updatedBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface PageDesignVersionDoc {
  _id: ObjectId;
  pageId: ObjectId;
  version: number;
  design: StatusPageDesign;
  publishedBy: ObjectId;
  publishedAt: Date;
}

export interface PageAnnouncementDoc {
  _id: ObjectId;
  pageId: ObjectId;
  title: string;
  body: string;
  severity: "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";
  ctaLabel: string | null;
  ctaUrl: string | null;
  startsAt: Date;
  endsAt: Date | null;
  dismissible: boolean;
  priority: number;
  surfaces: Array<"STATUS" | "HISTORY" | "INCIDENT" | "ACCESS" | "HUB">;
  createdBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface PageAccessGroupDoc {
  _id: ObjectId;
  pageId: ObjectId;
  name: string;
  componentIds: string; // JSON array
}

export interface PageAccessUserDoc {
  _id: ObjectId;
  pageId: ObjectId;
  email: string;
  passwordHash: string;
  groupId: ObjectId | null;
  componentIds: string; // JSON array
  createdAt: Date;
}

export interface ComponentGroupDoc {
  _id: ObjectId;
  pageId: ObjectId;
  name: string;
  description: string;
  order: number;
  collapsed: boolean;
}

export interface ComponentDoc {
  _id: ObjectId;
  pageId: ObjectId;
  groupId: ObjectId | null;
  name: string;
  description: string;
  status: string; // OPERATIONAL, DEGRADED_PERFORMANCE, PARTIAL_OUTAGE, MAJOR_OUTAGE, UNDER_MAINTENANCE
  order: number;
  visible: boolean;
  showUptime: boolean;
  manualStatus: string;
  isThirdParty: boolean;
  thirdPartyProvider: string | null;
  automationTokenHash: string;
  automationTokenPrefix: string;
  automationTokenLastFour: string;
  createdAt: Date;
}

export interface ComponentStatusEventDoc {
  _id: ObjectId;
  componentId: ObjectId;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  isMaintenance: boolean;
  note?: string | null;
}

export interface IncidentDoc {
  _id: ObjectId;
  pageId: ObjectId;
  name: string;
  status: string; // INVESTIGATING, IDENTIFIED, MONITORING, RESOLVED
  impact: string; // NONE, MINOR, MAJOR, CRITICAL
  pageWide: boolean;
  isMaintenance: boolean;
  maintenanceStatus: string | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  autoTransition: boolean;
  reminderMinutesBefore?: number | null;
  reminderSentAt?: Date | null;
  notifySubscribers: boolean;
  postmortemBody: string | null;
  postmortemPublishedAt: Date | null;
  createdAt: Date;
  resolvedAt: Date | null;
  backfilled: boolean;
}

export interface IncidentUpdateDoc {
  _id: ObjectId;
  incidentId: ObjectId;
  status: string;
  body: string;
  createdAt: Date;
  notified: boolean;
  editedAt?: Date | null;
  editedBy?: ObjectId | null;
}

export interface IncidentComponentDoc {
  _id: ObjectId;
  incidentId: ObjectId;
  componentId: ObjectId;
  newStatus: string;
}

export interface TemplateGroupDoc {
  _id: ObjectId;
  pageId: ObjectId;
  name: string;
}

export interface IncidentTemplateDoc {
  _id: ObjectId;
  pageId: ObjectId;
  groupId: ObjectId | null;
  title: string;
  body: string;
  defaultStatus: string;
  defaultImpact: string;
  defaultComponentIds: string;
  kind?: "INCIDENT" | "UPDATE" | "RESOLUTION" | "MAINTENANCE" | "POSTMORTEM";
  variables?: string[];
  notifyByDefault?: boolean;
  archivedAt?: Date | null;
  updatedAt?: Date;
  createdAt: Date;
}

export interface SubscriberDoc {
  _id: ObjectId;
  pageId: ObjectId;
  channel: string; // EMAIL, SMS, WEBHOOK, SLACK
  contact: string;
  componentIds: string;
  eventTypes?: string[];
  verified: boolean;
  quarantined: boolean;
  unsubscribeToken: string;
  createdAt: Date;
}

export interface SubscriptionOtpDoc {
  _id: ObjectId;
  pageId: string;
  channel: string;
  contact: string;
  codeHash: string;
  componentIds: string;
  attempts: number;
  expiresAt: Date;
  createdAt: Date;
}

export interface MetricDoc {
  _id: ObjectId;
  pageId: ObjectId;
  componentId: ObjectId | null;
  name: string;
  suffix: string;
  description: string;
  visible: boolean;
  decimals: number;
}

export interface MetricPointDoc {
  _id: ObjectId;
  metricId: ObjectId;
  timestamp: Date;
  value: number;
}

export interface MonitorDoc {
  _id: ObjectId;
  pageId: ObjectId;
  /** Present when this monitor is attached from the global master catalog. */
  templateId?: ObjectId | null;
  componentId: ObjectId | null;
  name: string;
  type: string; // HTTP, TCP, PING, SSL, KEYWORD
  enabled: boolean;

  // target
  target: string; // URL (HTTP/SSL/KEYWORD) or host (TCP/PING)
  port: number | null; // TCP
  method: string; // HTTP: GET/POST/HEAD
  requestBody: string | null;
  requestHeaders: string; // JSON object string, custom headers

  // assertions
  expectedStatusRange: string; // e.g. "200-299"
  keywordMatch: string | null;
  keywordAbsent: string | null;
  sslWarnDays: number | null;

  // security / auth (HTTP)
  authType: string; // NONE, BASIC, BEARER, HEADER
  authUsername: string | null;
  authSecret: string | null;
  authHeaderName: string | null;
  verifyTls: boolean;

  // scheduling & thresholds
  intervalSec: number;
  timeoutMs: number;
  failThreshold: number;
  recoverThreshold: number;
  downStatus: string;

  // automated actions
  actionFlipStatus: boolean;
  actionRecordMetric: boolean;
  actionAutoIncident: boolean;
  actionNotify: boolean;
  metricId: ObjectId | null;

  // runtime state
  lastCheckedAt: Date | null;
  lastLatencyMs: number | null;
  lastOk: boolean | null;
  lastError: string | null;
  consecutiveFails: number;
  consecutiveOks: number;
  isDown: boolean;
  currentIncidentId: ObjectId | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  runRequestedAt: Date | null;
  createdAt: Date;
  tags?: string[];
  groupName?: string | null;
  heartbeatTokenHash?: string | null;
  heartbeatGraceSec?: number | null;
  lastHeartbeatAt?: Date | null;
  dnsRecordType?: string | null;
  dnsExpectedValue?: string | null;
}

export interface AssetDoc {
  _id: ObjectId;
  orgId: ObjectId;
  pageId: ObjectId;
  kind: "LOGO" | "FAVICON" | "COVER";
  storageDriver: "LOCAL" | "S3";
  storageKey: string;
  publicUrl: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  createdBy: ObjectId;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface NotificationDestinationDoc {
  _id: ObjectId;
  pageId: ObjectId;
  name: string;
  channel: string;
  configCiphertext: string;
  active: boolean;
  verifiedAt: Date | null;
  lastTestedAt: Date | null;
  lastTestOk: boolean | null;
  lastError: string | null;
  eventTypes: string[];
  componentIds: ObjectId[] | null;
  createdAt: Date;
}

export interface PlatformConfigurationDoc {
  _id: "global";
  enabledDestinationChannels: string[];
  updatedBy: ObjectId;
  updatedAt: Date;
}

export interface AnalyticsDailyDoc {
  _id: string;
  pageId: ObjectId;
  date: string;
  views: number;
  incidentViews: number;
  subscriptionStarts: number;
  subscriptionCompletions: number;
  referrers: Record<string, number>;
  expiresAt: Date;
  updatedAt: Date;
}

export interface MonitorCheckDoc {
  _id: ObjectId;
  monitorId: ObjectId;
  checkedAt: Date;
  ok: boolean;
  latencyMs: number | null;
  statusCode: number | null;
  error: string | null;
}

export interface WebhookEndpointDoc {
  _id: ObjectId;
  pageId: ObjectId;
  url: string;
  secretHash: string;
  secretCiphertext: string;
  secretPrefix: string;
  secretLastFour: string;
  active: boolean;
  verifiedAt: Date | null;
  verificationTokenHash: string | null;
  createdAt: Date;
}

export interface NotificationLogDoc {
  _id: ObjectId;
  pageId: string;
  channel: string;
  contact: string;
  subject: string;
  body: string;
  status: string; // SENT, FAILED
  responseStatus?: number | null;
  error?: string | null;
  attempt?: number;
  createdAt: Date;
}

type NotificationJobStatus =
  | "PENDING"
  | "PROCESSING"
  | "SENT"
  | "FAILED"
  | "DEAD_LETTER"
  | "BLOCKED";

export interface NotificationJobDoc {
  _id: ObjectId;
  pageId: ObjectId;
  subscriberId: ObjectId | null;
  endpointId: ObjectId | null;
  destinationId?: ObjectId | null;
  channel: string;
  contact: string;
  subject: string;
  body: string;
  eventType: string;
  payload: Record<string, unknown>;
  deduplicationKey: string;
  status: NotificationJobStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  responseStatus: number | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
}

export interface WorkerHeartbeatDoc {
  _id: ObjectId;
  workerId: string;
  startedAt: Date;
  lastSeenAt: Date;
  version: string;
  status: "STARTING" | "READY" | "STOPPING";
  lastLoopAt?: Date | null;
  lastError?: string | null;
}

export interface MigrationDoc {
  _id: string;
  appliedAt: Date;
  checksum: string;
}

export interface FeedTokenDoc {
  _id: ObjectId;
  pageId: ObjectId;
  name: string;
  tokenHash: string;
  prefix: string;
  lastFour: string;
  componentIds: ObjectId[] | null;
  createdBy: ObjectId;
  createdAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
}

export interface RateLimitDoc {
  _id: string;
  count: number;
  windowStartedAt: Date;
  expiresAt: Date;
}

export interface MonitorTemplateDoc {
  _id: ObjectId;
  name: string;
  category: string;
  description: string;
  type: string;
  target: string;
  port: number | null;
  expectedStatusRange: string;
  keywordMatch: string | null;
  enabled: boolean;
}

// ---------- Collection getters ----------

export const collections = {
  organizations: () => db.collection<OrganizationDoc>("organizations"),
  platformAdmins: () => db.collection<PlatformAdminDoc>("platformAdmins"),
  platformInvites: () => db.collection<PlatformInviteDoc>("platformInvites"),
  platformAuditLogs: () => db.collection<PlatformAuditLogDoc>("platformAuditLogs"),
  platformJobs: () => db.collection<PlatformJobDoc>("platformJobs"),
  organizationTombstones: () =>
    db.collection<OrganizationTombstoneDoc>("organizationTombstones"),
  users: () => db.collection<UserDoc>("users"),
  memberships: () => db.collection<MembershipDoc>("memberships"),
  supportSessions: () => db.collection<SupportSessionDoc>("supportSessions"),
  authSessions: () => db.collection<AuthSessionDoc>("authSessions"),
  identityConnections: () =>
    db.collection<IdentityConnectionDoc>("identityConnections"),
  externalIdentities: () =>
    db.collection<ExternalIdentityDoc>("externalIdentities"),
  scimTokens: () => db.collection<ScimTokenDoc>("scimTokens"),
  scimGroups: () => db.collection<ScimGroupDoc>("scimGroups"),
  samlRequests: () => db.collection<SamlRequestDoc>("samlRequests"),
  retentionPolicies: () =>
    db.collection<RetentionPolicyDoc>("retentionPolicies"),
  dataExportJobs: () => db.collection<DataExportJobDoc>("dataExportJobs"),
  auditChainStates: () => db.collection<AuditChainStateDoc>("auditChainStates"),
  auditSinks: () => db.collection<AuditSinkDoc>("auditSinks"),
  auditDeliveryJobs: () =>
    db.collection<AuditDeliveryJobDoc>("auditDeliveryJobs"),
  apiKeys: () => db.collection<ApiKeyDoc>("apiKeys"),
  auditLogs: () => db.collection<AuditLogDoc>("auditLogs"),
  pages: () => db.collection<PageDoc>("pages"),
  pageDesignDrafts: () => db.collection<PageDesignDraftDoc>("pageDesignDrafts"),
  pageDesignVersions: () => db.collection<PageDesignVersionDoc>("pageDesignVersions"),
  pageAnnouncements: () => db.collection<PageAnnouncementDoc>("pageAnnouncements"),
  pageAccessGroups: () => db.collection<PageAccessGroupDoc>("pageAccessGroups"),
  pageAccessUsers: () => db.collection<PageAccessUserDoc>("pageAccessUsers"),
  componentGroups: () => db.collection<ComponentGroupDoc>("componentGroups"),
  components: () => db.collection<ComponentDoc>("components"),
  componentStatusEvents: () => db.collection<ComponentStatusEventDoc>("componentStatusEvents"),
  incidents: () => db.collection<IncidentDoc>("incidents"),
  incidentUpdates: () => db.collection<IncidentUpdateDoc>("incidentUpdates"),
  incidentComponents: () => db.collection<IncidentComponentDoc>("incidentComponents"),
  templateGroups: () => db.collection<TemplateGroupDoc>("templateGroups"),
  incidentTemplates: () => db.collection<IncidentTemplateDoc>("incidentTemplates"),
  subscribers: () => db.collection<SubscriberDoc>("subscribers"),
  subscriptionOtps: () => db.collection<SubscriptionOtpDoc>("subscriptionOtps"),
  metrics: () => db.collection<MetricDoc>("metrics"),
  metricPoints: () => db.collection<MetricPointDoc>("metricPoints"),
  monitors: () => db.collection<MonitorDoc>("monitors"),
  monitorChecks: () => db.collection<MonitorCheckDoc>("monitorChecks"),
  webhookEndpoints: () => db.collection<WebhookEndpointDoc>("webhookEndpoints"),
  notificationLogs: () => db.collection<NotificationLogDoc>("notificationLogs"),
  notificationJobs: () => db.collection<NotificationJobDoc>("notificationJobs"),
  workerHeartbeats: () => db.collection<WorkerHeartbeatDoc>("workerHeartbeats"),
  migrations: () => db.collection<MigrationDoc>("migrations"),
  feedTokens: () => db.collection<FeedTokenDoc>("feedTokens"),
  rateLimits: () => db.collection<RateLimitDoc>("rateLimits"),
  monitorTemplates: () => db.collection<MonitorTemplateDoc>("monitorTemplates"),
  assets: () => db.collection<AssetDoc>("assets"),
  notificationDestinations: () =>
    db.collection<NotificationDestinationDoc>("notificationDestinations"),
  platformConfiguration: () =>
    db.collection<PlatformConfigurationDoc>("platformConfiguration"),
  analyticsDaily: () => db.collection<AnalyticsDailyDoc>("analyticsDaily"),
};

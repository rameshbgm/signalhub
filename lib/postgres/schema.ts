import type { ColumnType, Generated, Selectable } from "kysely";

type SqlRow = Record<string, unknown>;
type Timestamp = ColumnType<Date, Date | string, Date | string>;
type GeneratedTimestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type NullableTimestamp = ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;

export type MembershipRole = "ADMIN" | "INCIDENT_MANAGER" | "RESPONDER" | "VIEWER";
export type AuthMethod = "PASSWORD" | "OIDC" | "SAML" | "SUPPORT";

export type IdentityRoleMapping = {
  group: string;
  role: MembershipRole;
  pageIds?: string[] | null;
};

export interface IdentityConnectionTable {
  id: Generated<string>;
  name: string;
  slug: string;
  type: "OIDC" | "SAML";
  audience: "ORGANIZATION" | "PLATFORM";
  orgId: string | null;
  enabled: Generated<boolean>;
  configCiphertext: string;
  roleMappings: Generated<IdentityRoleMapping[]>;
  defaultRole: MembershipRole | null;
  acceptedAcrValues: Generated<string[]>;
  acceptedAmrValues: Generated<string[]>;
  allowJitProvisioning: Generated<boolean>;
  lastTestedAt: NullableTimestamp;
  lastTestOk: boolean | null;
  lastError: string | null;
  createdBy: string;
  createdAt: GeneratedTimestamp;
  updatedAt: GeneratedTimestamp;
}

export interface ExternalIdentityTable {
  id: Generated<string>;
  connectionId: string;
  userId: string | null;
  subject: string;
  canonicalEmail: string;
  groups: Generated<string[]>;
  version: Generated<number>;
  lastLoginAt: NullableTimestamp;
  createdAt: GeneratedTimestamp;
  updatedAt: GeneratedTimestamp;
}

export interface SamlRequestTable {
  id: string;
  value: string;
  createdAt: GeneratedTimestamp;
  expiresAt: Timestamp;
}

export interface ScimTokenTable {
  id: Generated<string>;
  connectionId: string;
  tokenHash: string;
  prefix: string;
  lastFour: string;
  createdBy: string;
  createdAt: GeneratedTimestamp;
  lastUsedAt: NullableTimestamp;
  expiresAt: NullableTimestamp;
  revokedAt: NullableTimestamp;
}

export interface ScimGroupTable {
  id: Generated<string>;
  connectionId: string;
  externalId: string | null;
  displayName: string;
  memberExternalIds: Generated<string[]>;
  version: Generated<number>;
  createdAt: GeneratedTimestamp;
  updatedAt: GeneratedTimestamp;
}
export type ScimGroupRow = Selectable<ScimGroupTable>;

export type IdentityConnectionRow = Selectable<IdentityConnectionTable>;

export interface OrganizationTable {
  id: Generated<string>;
  name: string;
  slug: string;
  contactEmail: string | null;
  suspended: Generated<boolean>;
  status: Generated<"PROVISIONING" | "ACTIVE" | "SUSPENDED" | "DELETING">;
  statusReason: string | null;
  statusChangedAt: NullableTimestamp;
  statusChangedBy: string | null;
  mutationRevision: Generated<number>;
  createdAt: GeneratedTimestamp;
  updatedAt: GeneratedTimestamp;
}

export interface PlatformAuditLogTable {
  id: Generated<string>;
  actorId: string | null;
  actorEmail: string;
  actorRole: "ADMIN" | "SYSTEM";
  action: string;
  targetType: string;
  targetId: string;
  organizationId: string | null;
  reason: string | null;
  metadata: unknown;
  previousHash: string | null;
  entryHash: string | null;
  chainSequence: number | null;
  createdAt: GeneratedTimestamp;
}

export interface UserTable {
  id: Generated<string>;
  username: string;
  canonicalUsername: string;
  email: string;
  canonicalEmail: string;
  passwordHash: string | null;
  name: string;
  twoFactorEnabled: Generated<boolean>;
  oidcIssuer: string | null;
  oidcSubject: string | null;
  disabled: Generated<boolean>;
  mustChangePassword: Generated<boolean>;
  mustCompleteProfile: Generated<boolean>;
  sessionVersion: Generated<number>;
  mfaRequired: Generated<boolean>;
  totpSecretCiphertext: string | null;
  pendingTotpSecretCiphertext: string | null;
  recoveryCodeHashes: Generated<string[]>;
  mfaEnrolledAt: NullableTimestamp;
  createdAt: GeneratedTimestamp;
  updatedAt: GeneratedTimestamp;
}

export interface MembershipTable {
  id: Generated<string>;
  orgId: string;
  userId: string;
  role: MembershipRole;
  status: Generated<"INVITED" | "ACTIVE" | "REVOKED">;
  pageIds: string[] | null;
  invitationExpiresAt: NullableTimestamp;
  invitationTokenHash: string | null;
  activatedAt: NullableTimestamp;
  createdAt: GeneratedTimestamp;
}

export interface AuthSessionTable {
  id: Generated<string>;
  kind: Generated<"TENANT" | "PLATFORM">;
  tokenHash: string;
  userId: string | null;
  membershipId: string | null;
  orgId: string | null;
  sessionVersion: Generated<number>;
  authMethod: AuthMethod;
  mfaVerified: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: GeneratedTimestamp;
  lastSeenAt: GeneratedTimestamp;
  idleExpiresAt: Timestamp;
  absoluteExpiresAt: Timestamp;
  revokedAt: NullableTimestamp;
  revokedReason: string | null;
}

export interface SupportSessionTable {
  id: Generated<string>;
  platformAdminId: string;
  orgId: string;
  reason: string;
  mode: Generated<"VIEW" | "OPERATE">;
  scopes: Generated<string[]>;
  tokenHash: string;
  expiresAt: Timestamp;
  revokedAt: NullableTimestamp;
  revokedBy: string | null;
  revokedReason: string | null;
  endedAt: NullableTimestamp;
  createdAt: GeneratedTimestamp;
}

export interface PlatformJobTable {
  id: Generated<string>;
  type: "PURGE_ORGANIZATION";
  status: "QUEUED" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  requestedBy: string;
  reason: string;
  attempts: Generated<number>;
  maxAttempts: number;
  nextAttemptAt: Timestamp;
  leaseOwner: string | null;
  leaseExpiresAt: NullableTimestamp;
  lastError: string | null;
  purgeScope: unknown | null;
  createdAt: GeneratedTimestamp;
  updatedAt: GeneratedTimestamp;
  startedAt: NullableTimestamp;
  completedAt: NullableTimestamp;
}

export interface OrganizationTombstoneTable {
  id: Generated<string>;
  organizationId: string;
  slug: string;
  name: string;
  requestedBy: string;
  reason: string;
  purgedAt: Timestamp;
  purgeScope: unknown | null;
}

export interface RetentionPolicyTable {
  id: Generated<string>;
  orgId: string | null;
  monitorChecksDays: number;
  analyticsDays: number;
  notificationLogsDays: number;
  resolvedIncidentsDays: number;
  auditLogsDays: number;
  createdAt: GeneratedTimestamp;
  updatedAt: GeneratedTimestamp;
  updatedBy: string;
}

export interface AuditChainStateTable {
  id: string;
  latestHash: string | null;
  sequence: Generated<number>;
  retainedSequence: number | null;
  retainedPreviousHash: string | null;
  updatedAt: GeneratedTimestamp;
}

export type PageType = "PUBLIC" | "PRIVATE" | "AUDIENCE";
export type ApiKeyScope =
  | "status.read"
  | "components.read"
  | "components.write"
  | "incidents.read"
  | "incidents.write"
  | "metrics.read"
  | "metrics.write"
  | "analytics.read";

export interface PageTable {
  id: Generated<string>;
  orgId: string;
  name: string;
  slug: string;
  type: PageType;
  isHub: Generated<boolean>;
  hubParentId: string | null;
  timezone: Generated<string>;
  language: Generated<string>;
  headline: Generated<string>;
  aboutText: Generated<string>;
  logoUrl: string | null;
  faviconUrl: string | null;
  coverImageUrl: string | null;
  coverImageFit: "COVER" | "CONTAIN" | null;
  coverImagePositionX: number | null;
  coverImagePositionY: number | null;
  coverImageCropX: number | null;
  coverImageCropY: number | null;
  coverImageCropWidth: number | null;
  coverImageCropHeight: number | null;
  brandColor: Generated<string>;
  layout: Generated<string>;
  supportUrl: string | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  passwordHash: string | null;
  removeBranding: Generated<boolean>;
  customCss: string | null;
  themePreset: string | null;
  themeMode: "SYSTEM" | "LIGHT" | "DARK" | null;
  allowThemeOverride: Generated<boolean>;
  analyticsEnabled: Generated<boolean>;
  publishedDesign: unknown | null;
  publishedDesignVersion: Generated<number>;
  designPublishedAt: NullableTimestamp;
  publicVisible: Generated<boolean>;
  setupCompletedAt: NullableTimestamp;
  deletedAt: NullableTimestamp;
  deletedBy: string | null;
  createdAt: GeneratedTimestamp;
}

export interface PageDesignDraftTable {
  id: Generated<string>;
  pageId: string;
  revision: number;
  basePublishedVersion: number;
  design: unknown;
  updatedBy: string;
  createdAt: GeneratedTimestamp;
  updatedAt: GeneratedTimestamp;
}

export interface PageDesignVersionTable {
  id: Generated<string>;
  pageId: string;
  version: number;
  design: unknown;
  publishedBy: string;
  publishedAt: GeneratedTimestamp;
}

export interface ComponentGroupTable {
  id: Generated<string>;
  pageId: string;
  name: string;
  description: Generated<string>;
  order: Generated<number>;
  collapsed: Generated<boolean>;
}

export interface ComponentTable {
  id: Generated<string>;
  pageId: string;
  groupId: string | null;
  name: string;
  description: Generated<string>;
  status: Generated<string>;
  order: Generated<number>;
  visible: Generated<boolean>;
  showUptime: Generated<boolean>;
  manualStatus: Generated<string>;
  isThirdParty: Generated<boolean>;
  thirdPartyProvider: string | null;
  automationTokenHash: string;
  automationTokenPrefix: string;
  automationTokenLastFour: string;
  createdAt: GeneratedTimestamp;
}

export interface AuditLogTable {
  id: Generated<string>;
  orgId: string;
  actor: string;
  action: string;
  target: string;
  metadata: unknown | null;
  supportSessionId: string | null;
  requestId: string | null;
  sourceIp: string | null;
  userAgent: string | null;
  outcome: "SUCCESS" | "FAILURE" | null;
  previousHash: string | null;
  entryHash: string | null;
  chainSequence: number | null;
  createdAt: GeneratedTimestamp;
}

export interface RateLimitTable {
  id: string;
  count: number;
  windowStartedAt: Timestamp;
  expiresAt: Timestamp;
}

export interface PageAccessGroupTable {
  id: Generated<string>;
  pageId: string;
  name: string;
  componentIds: Generated<string[]>;
}

export interface PageAnnouncementTable {
  id: Generated<string>;
  pageId: string;
  title: string;
  body: string;
  severity: "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";
  ctaLabel: string | null;
  ctaUrl: string | null;
  startsAt: Timestamp;
  endsAt: NullableTimestamp;
  dismissible: Generated<boolean>;
  priority: Generated<number>;
  surfaces: Generated<string[]>;
  createdBy: string;
  createdAt: GeneratedTimestamp;
  updatedAt: GeneratedTimestamp;
}

export interface PageAccessUserTable {
  id: Generated<string>;
  pageId: string;
  email: string;
  passwordHash: string;
  groupId: string | null;
  componentIds: Generated<string[]>;
  createdAt: GeneratedTimestamp;
}

export interface ComponentStatusEventTable {
  id: Generated<string>;
  componentId: string;
  status: string;
  startedAt: Timestamp;
  endedAt: NullableTimestamp;
  isMaintenance: Generated<boolean>;
  note: string | null;
}

export interface IncidentTable {
  id: Generated<string>;
  pageId: string;
  name: string;
  status: string;
  impact: string;
  pageWide: Generated<boolean>;
  isMaintenance: Generated<boolean>;
  maintenanceStatus: string | null;
  scheduledStart: NullableTimestamp;
  scheduledEnd: NullableTimestamp;
  autoTransition: Generated<boolean>;
  reminderMinutesBefore: number | null;
  reminderSentAt: NullableTimestamp;
  notifySubscribers: Generated<boolean>;
  postmortemBody: string | null;
  postmortemPublishedAt: NullableTimestamp;
  createdAt: GeneratedTimestamp;
  resolvedAt: NullableTimestamp;
  backfilled: Generated<boolean>;
}

export interface IncidentUpdateTable {
  id: Generated<string>;
  incidentId: string;
  status: string;
  body: string;
  createdAt: GeneratedTimestamp;
  notified: Generated<boolean>;
  editedAt: NullableTimestamp;
  editedBy: string | null;
}

export interface IncidentComponentTable {
  id: Generated<string>;
  incidentId: string;
  componentId: string;
  newStatus: string;
}

export interface MetricTable {
  id: Generated<string>;
  pageId: string;
  componentId: string | null;
  name: string;
  suffix: Generated<string>;
  description: Generated<string>;
  visible: Generated<boolean>;
  decimals: Generated<number>;
}

export interface MetricPointTable {
  id: Generated<string>;
  metricId: string;
  timestamp: Timestamp;
  value: number;
}

export interface FeedTokenTable {
  id: Generated<string>;
  pageId: string;
  name: string;
  tokenHash: string;
  prefix: string;
  lastFour: string;
  componentIds: string[] | null;
  createdBy: string;
  createdAt: GeneratedTimestamp;
  expiresAt: NullableTimestamp;
  revokedAt: NullableTimestamp;
  lastUsedAt: NullableTimestamp;
}

export interface ApiKeyTable {
  id: Generated<string>;
  orgId: string;
  name: string;
  keyHash: string;
  prefix: string;
  lastFour: string;
  createdAt: GeneratedTimestamp;
  lastUsedAt: NullableTimestamp;
  revokedAt: NullableTimestamp;
  createdBy: string | null;
  scopes: Generated<ApiKeyScope[]>;
  pageIds: string[] | null;
  expiresAt: NullableTimestamp;
  allowedCidrs: string[] | null;
  legacyFullAccess: Generated<boolean>;
}

export interface WorkerHeartbeatTable {
  id: Generated<string>;
  workerId: string;
  startedAt: Timestamp;
  lastSeenAt: Timestamp;
  version: string;
  status: "STARTING" | "READY" | "STOPPING";
  lastLoopAt: NullableTimestamp;
  lastError: string | null;
}

export interface PlatformConfigurationTable {
  id: "global";
  enabledDestinationChannels: Generated<string[]>;
  updatedBy: string;
  updatedAt: GeneratedTimestamp;
}

export interface MaintenanceLeaseTable {
  id: string;
  owner: string;
  leaseExpiresAt: Timestamp;
  lastCompletedAt: NullableTimestamp;
}

export interface AnalyticsDailyTable {
  id: string;
  pageId: string;
  date: string;
  views: Generated<number>;
  incidentViews: Generated<number>;
  subscriptionStarts: Generated<number>;
  subscriptionCompletions: Generated<number>;
  referrers: Generated<Record<string, number>>;
  expiresAt: Timestamp;
  updatedAt: GeneratedTimestamp;
}

export interface SubscriberTable {
  id: Generated<string>;
  pageId: string;
  channel: string;
  contact: string;
  componentIds: Generated<string[]>;
  eventTypes: Generated<string[]>;
  verified: Generated<boolean>;
  quarantined: Generated<boolean>;
  unsubscribeToken: string;
  createdAt: GeneratedTimestamp;
}

export interface SubscriptionOtpTable {
  id: Generated<string>;
  pageId: string;
  channel: string;
  contact: string;
  codeHash: string;
  componentIds: Generated<string[]>;
  attempts: Generated<number>;
  expiresAt: Timestamp;
  createdAt: GeneratedTimestamp;
}

export interface WebhookEndpointTable {
  id: Generated<string>;
  pageId: string;
  url: string;
  secretHash: string;
  secretCiphertext: string;
  secretPrefix: string;
  secretLastFour: string;
  active: Generated<boolean>;
  verifiedAt: NullableTimestamp;
  verificationTokenHash: string | null;
  createdAt: GeneratedTimestamp;
}

export interface NotificationDestinationTable {
  id: Generated<string>;
  pageId: string;
  name: string;
  channel: string;
  configCiphertext: string;
  active: Generated<boolean>;
  verifiedAt: NullableTimestamp;
  lastTestedAt: NullableTimestamp;
  lastTestOk: boolean | null;
  lastError: string | null;
  eventTypes: Generated<string[]>;
  componentIds: string[] | null;
  createdAt: GeneratedTimestamp;
}
export type NotificationDestinationRow = Selectable<NotificationDestinationTable>;

export type NotificationJobStatus =
  | "PENDING"
  | "PROCESSING"
  | "SENT"
  | "FAILED"
  | "DEAD_LETTER"
  | "BLOCKED";

export interface NotificationJobTable {
  id: Generated<string>;
  pageId: string;
  subscriberId: string | null;
  endpointId: string | null;
  destinationId: string | null;
  channel: string;
  contact: string;
  subject: string;
  body: string;
  eventType: string;
  payload: unknown;
  deduplicationKey: string;
  status: NotificationJobStatus;
  attempts: Generated<number>;
  maxAttempts: number;
  nextAttemptAt: Timestamp;
  leaseOwner: string | null;
  leaseExpiresAt: NullableTimestamp;
  responseStatus: number | null;
  lastError: string | null;
  createdAt: GeneratedTimestamp;
  updatedAt: GeneratedTimestamp;
  sentAt: NullableTimestamp;
}
export type NotificationJobRow = Selectable<NotificationJobTable>;

export interface NotificationLogTable {
  id: Generated<string>;
  pageId: string;
  channel: string;
  contact: string;
  subject: string;
  body: string;
  status: string;
  responseStatus: number | null;
  error: string | null;
  attempt: number | null;
  createdAt: GeneratedTimestamp;
}

export interface MonitorTable {
  id: Generated<string>;
  pageId: string;
  templateId: string | null;
  componentId: string | null;
  name: string;
  type: string;
  enabled: Generated<boolean>;
  target: string;
  port: number | null;
  method: Generated<string>;
  requestBody: string | null;
  requestHeaders: Generated<string>;
  expectedStatusRange: Generated<string>;
  keywordMatch: string | null;
  keywordAbsent: string | null;
  sslWarnDays: number | null;
  authType: Generated<string>;
  authUsername: string | null;
  authSecret: string | null;
  authHeaderName: string | null;
  verifyTls: Generated<boolean>;
  intervalSec: number;
  timeoutMs: number;
  failThreshold: Generated<number>;
  recoverThreshold: Generated<number>;
  downStatus: string;
  actionFlipStatus: Generated<boolean>;
  actionRecordMetric: Generated<boolean>;
  actionAutoIncident: Generated<boolean>;
  actionNotify: Generated<boolean>;
  metricId: string | null;
  lastCheckedAt: NullableTimestamp;
  lastLatencyMs: number | null;
  lastOk: boolean | null;
  lastError: string | null;
  consecutiveFails: Generated<number>;
  consecutiveOks: Generated<number>;
  isDown: Generated<boolean>;
  currentIncidentId: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: NullableTimestamp;
  runRequestedAt: NullableTimestamp;
  createdAt: GeneratedTimestamp;
  tags: Generated<string[]>;
  groupName: string | null;
  heartbeatTokenHash: string | null;
  heartbeatGraceSec: number | null;
  lastHeartbeatAt: NullableTimestamp;
  dnsRecordType: string | null;
  dnsExpectedValue: string | null;
}

export interface MonitorCheckTable {
  id: Generated<string>;
  monitorId: string;
  checkedAt: Timestamp;
  ok: boolean;
  latencyMs: number | null;
  statusCode: number | null;
  error: string | null;
}

export interface MonitorTemplateTable {
  id: Generated<string>;
  name: string;
  category: string;
  description: string;
  type: string;
  target: string;
  port: number | null;
  expectedStatusRange: string;
  keywordMatch: string | null;
  enabled: Generated<boolean>;
}

export type MonitorRow = Selectable<MonitorTable>;
export type MonitorCheckRow = Selectable<MonitorCheckTable>;
export type PlatformJobRow = Selectable<PlatformJobTable>;

export interface TemplateGroupTable {
  id: Generated<string>;
  pageId: string;
  name: string;
}

export interface IncidentTemplateTable {
  id: Generated<string>;
  pageId: string;
  groupId: string | null;
  title: string;
  body: string;
  defaultStatus: string;
  defaultImpact: string;
  defaultComponentIds: Generated<string[]>;
  kind: Generated<string>;
  variables: Generated<string[]>;
  notifyByDefault: Generated<boolean>;
  archivedAt: NullableTimestamp;
  updatedAt: GeneratedTimestamp;
  createdAt: GeneratedTimestamp;
}

export interface AssetTable {
  id: Generated<string>;
  orgId: string;
  pageId: string;
  kind: "LOGO" | "FAVICON" | "COVER";
  storageDriver: "LOCAL" | "S3";
  storageKey: string;
  publicUrl: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  createdBy: string;
  createdAt: GeneratedTimestamp;
  deletedAt: NullableTimestamp;
}

export interface DataExportJobTable {
  id: Generated<string>;
  orgId: string;
  status: "QUEUED" | "PROCESSING" | "SUCCEEDED" | "FAILED";
  requestedBy: string;
  storageKey: string | null;
  storageDriver: "LOCAL" | "S3" | null;
  checksum: string | null;
  attempts: Generated<number>;
  leaseOwner: string | null;
  leaseExpiresAt: NullableTimestamp;
  lastError: string | null;
  createdAt: GeneratedTimestamp;
  updatedAt: GeneratedTimestamp;
  completedAt: NullableTimestamp;
}

export interface AuditSinkTable {
  id: Generated<string>;
  name: string;
  orgId: string | null;
  url: string;
  secretCiphertext: string;
  enabled: Generated<boolean>;
  createdBy: string;
  createdAt: GeneratedTimestamp;
  updatedAt: GeneratedTimestamp;
}

export interface AuditDeliveryJobTable {
  id: Generated<string>;
  sinkId: string;
  deduplicationKey: string;
  payload: unknown;
  status: "PENDING" | "PROCESSING" | "SENT" | "DEAD_LETTER";
  attempts: Generated<number>;
  maxAttempts: number;
  nextAttemptAt: Timestamp;
  leaseOwner: string | null;
  leaseExpiresAt: NullableTimestamp;
  lastError: string | null;
  responseStatus: number | null;
  createdAt: GeneratedTimestamp;
  updatedAt: GeneratedTimestamp;
  sentAt: NullableTimestamp;
}

export type OrganizationRow = Selectable<OrganizationTable>;
export type UserRow = Selectable<UserTable>;
export type MembershipRow = Selectable<MembershipTable>;
export type AuthSessionRow = Selectable<AuthSessionTable>;
export type PageRow = Selectable<PageTable>;
export type ComponentGroupRow = Selectable<ComponentGroupTable>;
export type ComponentRow = Selectable<ComponentTable>;
export type ApiKeyRow = Selectable<ApiKeyTable>;
export type IncidentRow = Selectable<IncidentTable>;
export type IncidentUpdateRow = Selectable<IncidentUpdateTable>;
export type IncidentComponentRow = Selectable<IncidentComponentTable>;
export type MetricRow = Selectable<MetricTable>;
export type MetricPointRow = Selectable<MetricPointTable>;

/**
 * Transitional table map for the PostgreSQL migration. Each feature slice
 * replaces SqlRow with its exact row type as its queries are rewritten.
 */
export interface SignalHubDatabase {
  organizations: OrganizationTable;
  users: UserTable;
  memberships: MembershipTable;
  authSessions: AuthSessionTable;
  supportSessions: SupportSessionTable;
  platformAuditLogs: PlatformAuditLogTable;
  platformJobs: PlatformJobTable;
  organizationTombstones: OrganizationTombstoneTable;
  apiKeys: ApiKeyTable;
  auditLogs: AuditLogTable;
  identityConnections: IdentityConnectionTable;
  externalIdentities: ExternalIdentityTable;
  scimTokens: ScimTokenTable;
  scimGroups: ScimGroupTable;
  samlRequests: SamlRequestTable;
  retentionPolicies: RetentionPolicyTable;
  dataExportJobs: DataExportJobTable;
  auditChainStates: AuditChainStateTable;
  auditSinks: AuditSinkTable;
  auditDeliveryJobs: AuditDeliveryJobTable;
  pages: PageTable;
  pageDesignDrafts: PageDesignDraftTable;
  pageDesignVersions: PageDesignVersionTable;
  pageAnnouncements: PageAnnouncementTable;
  pageAccessGroups: PageAccessGroupTable;
  pageAccessUsers: PageAccessUserTable;
  componentGroups: ComponentGroupTable;
  components: ComponentTable;
  componentStatusEvents: ComponentStatusEventTable;
  incidents: IncidentTable;
  incidentUpdates: IncidentUpdateTable;
  incidentComponents: IncidentComponentTable;
  templateGroups: TemplateGroupTable;
  incidentTemplates: IncidentTemplateTable;
  subscribers: SubscriberTable;
  subscriptionOtps: SubscriptionOtpTable;
  metrics: MetricTable;
  metricPoints: MetricPointTable;
  monitorTemplates: MonitorTemplateTable;
  monitors: MonitorTable;
  monitorChecks: MonitorCheckTable;
  assets: AssetTable;
  notificationDestinations: NotificationDestinationTable;
  platformConfiguration: PlatformConfigurationTable;
  analyticsDaily: AnalyticsDailyTable;
  webhookEndpoints: WebhookEndpointTable;
  notificationLogs: NotificationLogTable;
  notificationJobs: NotificationJobTable;
  workerHeartbeats: WorkerHeartbeatTable;
  feedTokens: FeedTokenTable;
  rateLimits: RateLimitTable;
  maintenanceLeases: MaintenanceLeaseTable;
  schemaMigrations: SqlRow;
}

import { MongoClient, ObjectId, type Db } from "mongodb";

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

export interface OrganizationDoc {
  _id: ObjectId;
  name: string;
  slug: string;
  plan: string;
  createdAt: Date;
}

export interface TeamMemberDoc {
  _id: ObjectId;
  orgId: ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  role: string; // OWNER, ADMIN, EDITOR, RESPONDER
  twoFactorEnabled: boolean;
  createdAt: Date;
}

export interface ApiKeyDoc {
  _id: ObjectId;
  orgId: ObjectId;
  name: string;
  key: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export interface AuditLogDoc {
  _id: ObjectId;
  orgId: ObjectId;
  actor: string;
  action: string;
  target: string;
  createdAt: Date;
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
  brandColor: string;
  supportUrl: string | null;
  customDomain: string | null;
  passwordHash: string | null;
  removeBranding: boolean;
  customCss: string | null;
  createdAt: Date;
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
  isThirdParty: boolean;
  thirdPartyProvider: string | null;
  automationToken: string;
  createdAt: Date;
}

export interface ComponentStatusEventDoc {
  _id: ObjectId;
  componentId: ObjectId;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  isMaintenance: boolean;
}

export interface IncidentDoc {
  _id: ObjectId;
  pageId: ObjectId;
  name: string;
  status: string; // INVESTIGATING, IDENTIFIED, MONITORING, RESOLVED
  impact: string; // NONE, MINOR, MAJOR, CRITICAL
  isMaintenance: boolean;
  maintenanceStatus: string | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  autoTransition: boolean;
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
  createdAt: Date;
}

export interface SubscriberDoc {
  _id: ObjectId;
  pageId: ObjectId;
  channel: string; // EMAIL, SMS, WEBHOOK, SLACK
  contact: string;
  componentIds: string;
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
  code: string;
  componentIds: string;
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

export interface WebhookEndpointDoc {
  _id: ObjectId;
  pageId: ObjectId;
  url: string;
  secret: string;
  active: boolean;
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
  createdAt: Date;
}

export interface ThirdPartyProviderDoc {
  _id: ObjectId;
  name: string;
  category: string;
  homepage: string;
}

// ---------- Collection getters ----------

export const collections = {
  organizations: () => db.collection<OrganizationDoc>("organizations"),
  teamMembers: () => db.collection<TeamMemberDoc>("teamMembers"),
  apiKeys: () => db.collection<ApiKeyDoc>("apiKeys"),
  auditLogs: () => db.collection<AuditLogDoc>("auditLogs"),
  pages: () => db.collection<PageDoc>("pages"),
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
  webhookEndpoints: () => db.collection<WebhookEndpointDoc>("webhookEndpoints"),
  notificationLogs: () => db.collection<NotificationLogDoc>("notificationLogs"),
  thirdPartyProviders: () => db.collection<ThirdPartyProviderDoc>("thirdPartyProviders"),
};

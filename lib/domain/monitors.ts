import { ObjectId, type ClientSession, type WithId } from "mongodb";
import { z } from "zod";
import { collections, mongoClient, type MonitorDoc } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { encryptSecret } from "@/lib/encryption";
import { generateAutomationToken } from "@/lib/tokens";
import {
  MONITOR_TYPES,
  normalizeMonitorConfiguration,
} from "@/lib/monitor-validation";
import { validateMonitorTarget } from "@/lib/monitor-target-validation";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";

export { MONITOR_TYPES };
export const MONITOR_DOWN_STATUSES = [
  "DEGRADED_PERFORMANCE",
  "PARTIAL_OUTAGE",
  "MAJOR_OUTAGE",
] as const;

export const monitorInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(MONITOR_TYPES),
  componentId: z.string().nullable(),
  target: z.string().trim().max(2_048),
  port: z.number().int().min(1).max(65_535).nullable(),
  method: z.enum(["GET", "POST", "HEAD", "PUT", "PATCH"]),
  requestBody: z.string().max(100_000).nullable(),
  requestHeaders: z.string().max(20_000),
  expectedStatusRange: z.string().trim().max(7),
  keywordMatch: z.string().max(10_000).nullable(),
  keywordAbsent: z.string().max(10_000).nullable(),
  sslWarnDays: z.number().int().min(1).max(365).nullable(),
  authType: z.enum(["NONE", "BASIC", "BEARER", "HEADER"]),
  authUsername: z.string().max(1_000).nullable(),
  authSecret: z.string().max(10_000).nullable(),
  authHeaderName: z.string().max(200).nullable(),
  verifyTls: z.boolean(),
  intervalSec: z.number().int().min(10).max(86_400),
  timeoutMs: z.number().int().min(100).max(60_000),
  failThreshold: z.number().int().min(1).max(20),
  recoverThreshold: z.number().int().min(1).max(20),
  downStatus: z.enum(MONITOR_DOWN_STATUSES),
  actionFlipStatus: z.boolean(),
  actionRecordMetric: z.boolean(),
  actionAutoIncident: z.boolean(),
  actionNotify: z.boolean(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  groupName: z.string().trim().max(100).nullable().optional(),
  heartbeatGraceSec: z.number().int().min(0).max(86_400).nullable().optional(),
  dnsRecordType: z.enum(["A", "AAAA", "CNAME", "MX", "TXT", "NS"]).nullable().optional(),
  dnsExpectedValue: z.string().max(2_048).nullable().optional(),
});

export type MonitorInput = z.infer<typeof monitorInputSchema>;

declare const preparedMonitorInputBrand: unique symbol;
export type PreparedMonitorInput = MonitorInput & {
  readonly [preparedMonitorInputBrand]: true;
};

export async function prepareMonitorInput(
  rawInput: MonitorInput
): Promise<PreparedMonitorInput> {
  const parsed = monitorInputSchema.parse(rawInput);
  const input = normalizeMonitorConfiguration(parsed);
  const allowPrivate = process.env.MONITOR_ALLOW_PRIVATE_TARGETS === "true";
  await validateMonitorTarget(input, allowPrivate);
  if (input.requestHeaders.trim()) {
    const headers: unknown = JSON.parse(input.requestHeaders);
    if (!headers || Array.isArray(headers) || typeof headers !== "object") {
      throw new Error("Request headers must be a JSON object");
    }
  }
  return input as PreparedMonitorInput;
}

/**
 * Inserts a previously validated monitor using the caller's transaction.
 * This lets compound operations (for example component + monitor creation)
 * commit or roll back as one unit without nesting MongoDB transactions.
 */
export async function createPreparedMonitor(
  orgId: string,
  pageId: string,
  input: PreparedMonitorInput,
  session: ClientSession
) {
  await fenceActiveOrganizationMutation(orgId, session);
  const page = await collections.pages().findOne(
    { _id: oid(pageId), orgId: oid(orgId) },
    { session }
  );
  if (!page) throw new Error("Page not found in your organization");
  if (input.componentId) {
    const component = await collections.components().findOne({
      _id: oid(input.componentId),
      pageId: page._id,
    }, { session });
    if (!component) throw new Error("Component not found on this page");
  }

  const monitorId = new ObjectId();
  const metricId = input.actionRecordMetric ? new ObjectId() : null;
  const now = new Date();
  const heartbeatToken = input.type === "HEARTBEAT" ? generateAutomationToken() : null;
  if (metricId) {
    await collections.metrics().insertOne(
      {
        _id: metricId,
        pageId: page._id,
        componentId: input.componentId ? oid(input.componentId) : null,
        name: `${input.name} response time`,
        suffix: "ms",
        description: `Automatically recorded by monitor "${input.name}"`,
        visible: true,
        decimals: 0,
      },
      { session }
    );
  }
  const monitor: WithId<MonitorDoc> = {
    _id: monitorId,
    pageId: page._id,
    componentId: input.componentId ? oid(input.componentId) : null,
    name: input.name,
    type: input.type,
    enabled: true,
    target: input.target,
    port: input.port,
    method: input.method,
    requestBody: input.requestBody,
    requestHeaders: input.requestHeaders,
    expectedStatusRange: input.expectedStatusRange,
    keywordMatch: input.keywordMatch,
    keywordAbsent: input.keywordAbsent,
    sslWarnDays: input.sslWarnDays,
    authType: input.authType,
    authUsername: input.authUsername,
    authSecret: input.authSecret ? encryptSecret(input.authSecret) : null,
    authHeaderName: input.authHeaderName,
    verifyTls: input.verifyTls,
    intervalSec: input.intervalSec,
    timeoutMs: input.timeoutMs,
    failThreshold: input.failThreshold,
    recoverThreshold: input.recoverThreshold,
    downStatus: input.downStatus,
    actionFlipStatus: input.actionFlipStatus,
    actionRecordMetric: input.actionRecordMetric,
    actionAutoIncident: input.actionAutoIncident,
    actionNotify: input.actionNotify,
    metricId,
    lastCheckedAt: null,
    lastLatencyMs: null,
    lastOk: null,
    lastError: null,
    consecutiveFails: 0,
    consecutiveOks: 0,
    isDown: false,
    currentIncidentId: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    runRequestedAt: now,
    createdAt: now,
    tags: input.tags ?? [],
    groupName: input.groupName ?? null,
    heartbeatTokenHash: heartbeatToken?.hash ?? null,
    heartbeatGraceSec: input.heartbeatGraceSec ?? 60,
    lastHeartbeatAt: null,
    dnsRecordType: input.dnsRecordType ?? null,
    dnsExpectedValue: input.dnsExpectedValue ?? null,
  };
  await collections.monitors().insertOne(monitor, { session });
  return toId(monitor);
}

export async function createMonitor(
  orgId: string,
  pageId: string,
  rawInput: MonitorInput
) {
  const input = await prepareMonitorInput(rawInput);
  const session = mongoClient.startSession();
  try {
    let monitor: Awaited<ReturnType<typeof createPreparedMonitor>>;
    await session.withTransaction(async () => {
      monitor = await createPreparedMonitor(orgId, pageId, input, session);
    });
    return monitor!;
  } finally {
    await session.endSession();
  }
}

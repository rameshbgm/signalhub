import { z } from "zod";
import { isDatabaseId } from "@/lib/database-id";
import { INPUT_LIMITS } from "@/lib/input-limits";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/lib/postgres/client";
import { encryptSecret } from "@/lib/encryption";
import { generateAutomationToken } from "@/lib/tokens";
import { MONITOR_TYPES, normalizeMonitorConfiguration } from "@/lib/monitor-validation";
import { validateMonitorTarget } from "@/lib/monitor-target-validation";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { enqueueJobSweep, JOB_TASKS } from "@/lib/jobs";

const MONITOR_DOWN_STATUSES = ["DEGRADED_PERFORMANCE", "PARTIAL_OUTAGE", "MAJOR_OUTAGE"] as const;

const monitorInputSchema = z.object({
  name: z.string().trim().min(1).max(INPUT_LIMITS.title),
  type: z.enum(MONITOR_TYPES),
  componentId: z.string().refine(isDatabaseId, "Component not found on this page").nullable(),
  target: z.string().trim().max(INPUT_LIMITS.url),
  port: z.number().int().min(1).max(65_535).nullable(),
  method: z.enum(["GET", "POST", "HEAD", "PUT", "PATCH"]),
  requestBody: z.string().max(INPUT_LIMITS.monitorRequestBody).nullable(),
  requestHeaders: z.string().max(INPUT_LIMITS.monitorRequestHeaders),
  expectedStatusRange: z.string().trim().max(INPUT_LIMITS.monitorStatusRange),
  keywordMatch: z.string().max(INPUT_LIMITS.monitorKeyword).nullable(),
  keywordAbsent: z.string().max(INPUT_LIMITS.monitorKeyword).nullable(),
  sslWarnDays: z.number().int().min(1).max(365).nullable(),
  authType: z.enum(["NONE", "BASIC", "BEARER", "HEADER"]),
  authUsername: z.string().max(INPUT_LIMITS.monitorAuthUsername).nullable(),
  authSecret: z.string().max(INPUT_LIMITS.monitorAuthSecret).nullable(),
  authHeaderName: z.string().max(INPUT_LIMITS.monitorAuthHeaderName).nullable(),
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
  tags: z.array(z.string().trim().min(1).max(INPUT_LIMITS.monitorTag)).max(INPUT_LIMITS.monitorTags).optional(),
  groupName: z.string().trim().max(INPUT_LIMITS.monitorGroup).nullable().optional(),
  heartbeatGraceSec: z.number().int().min(0).max(86_400).nullable().optional(),
  dnsRecordType: z.enum(["A", "AAAA", "CNAME", "MX", "TXT", "NS"]).nullable().optional(),
  dnsExpectedValue: z.string().max(INPUT_LIMITS.url).nullable().optional(),
});

export type MonitorInput = z.infer<typeof monitorInputSchema>;
declare const preparedMonitorInputBrand: unique symbol;
export type PreparedMonitorInput = MonitorInput & { readonly [preparedMonitorInputBrand]: true };

export async function prepareMonitorInput(rawInput: MonitorInput): Promise<PreparedMonitorInput> {
  const parsed = monitorInputSchema.parse(rawInput);
  const input = normalizeMonitorConfiguration(parsed);
  await validateMonitorTarget(input, process.env.MONITOR_ALLOW_PRIVATE_TARGETS === "true");
  if (input.requestHeaders.trim()) {
    const headers: unknown = JSON.parse(input.requestHeaders);
    if (!headers || Array.isArray(headers) || typeof headers !== "object") {
      throw new Error("Request headers must be a JSON object");
    }
  }
  return input as PreparedMonitorInput;
}

export async function createPreparedMonitor(
  orgId: string,
  pageId: string,
  input: PreparedMonitorInput,
  transaction: DatabaseTransaction
) {
  await fenceActiveOrganizationMutation(orgId, transaction);
  const page = await transaction.selectFrom("pages").select("id")
    .where("id", "=", pageId).where("orgId", "=", orgId)
    .where("deletedAt", "is", null).forShare().executeTakeFirst();
  if (!page) throw new Error("Page not found in your organization");
  if (input.componentId) {
    const component = await transaction.selectFrom("components").select("id")
      .where("id", "=", input.componentId).where("pageId", "=", page.id).executeTakeFirst();
    if (!component) throw new Error("Component not found on this page");
  }
  const metric = input.actionRecordMetric
    ? await transaction.insertInto("metrics").values({
        pageId: page.id,
        componentId: input.componentId,
        name: `${input.name} response time`,
        suffix: "ms",
        description: `Automatically recorded by monitor "${input.name}"`,
        visible: true,
        decimals: 0,
      }).returning("id").executeTakeFirstOrThrow()
    : null;
  const now = new Date();
  const heartbeatToken = input.type === "HEARTBEAT" ? generateAutomationToken() : null;
  const monitor = await transaction.insertInto("monitors").values({
    pageId: page.id,
    componentId: input.componentId,
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
    metricId: metric?.id ?? null,
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
  }).returningAll().executeTakeFirstOrThrow();
  await enqueueJobSweep(transaction, JOB_TASKS.monitors);
  return monitor;
}

export async function createMonitor(orgId: string, pageId: string, rawInput: MonitorInput) {
  const input = await prepareMonitorInput(rawInput);
  return withDatabaseTransaction((transaction) => createPreparedMonitor(orgId, pageId, input, transaction));
}

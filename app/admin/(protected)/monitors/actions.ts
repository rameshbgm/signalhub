"use server";

import { revalidatePath } from "next/cache";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { encryptSecret } from "@/lib/encryption";
import { deleteMonitorCascade } from "@/lib/cascade";
import { createMonitor as createMonitorDomain, prepareMonitorInput, type MonitorInput } from "@/lib/domain/monitors";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import { writeSupportMutationAudit } from "@/lib/support-audit";
import { enqueueJobSweep, JOB_TASKS } from "@/lib/jobs";

function string(formData: FormData, key: string, fallback = "") {
  return String(formData.get(key) ?? fallback);
}

function optionalString(formData: FormData, key: string) {
  const value = string(formData, key).trim();
  return value || null;
}

function monitorInputFromForm(formData: FormData): MonitorInput {
  const legacyType = string(formData, "type", "HTTP");
  const type = legacyType === "SSL" ? "TLS" : legacyType === "PING" ? "ICMP" : legacyType;
  return {
    name: string(formData, "name"),
    type: type as MonitorInput["type"],
    componentId: optionalString(formData, "componentId"),
    target: string(formData, "target"),
    port: formData.get("port") ? Number(formData.get("port")) : null,
    method: string(formData, "method", "GET") as MonitorInput["method"],
    requestBody: optionalString(formData, "requestBody"),
    requestHeaders: string(formData, "requestHeaders"),
    expectedStatusRange: string(formData, "expectedStatusRange", "200-299"),
    keywordMatch: optionalString(formData, "keywordMatch"),
    keywordAbsent: optionalString(formData, "keywordAbsent"),
    sslWarnDays: formData.get("sslWarnDays") ? Number(formData.get("sslWarnDays")) : null,
    authType: string(formData, "authType", "NONE") as MonitorInput["authType"],
    authUsername: optionalString(formData, "authUsername"),
    authSecret: optionalString(formData, "authSecret"),
    authHeaderName: optionalString(formData, "authHeaderName"),
    verifyTls: formData.get("verifyTls") !== "off",
    intervalSec: Number(formData.get("intervalSec") ?? 300),
    timeoutMs: Number(formData.get("timeoutMs") ?? 10_000),
    failThreshold: Number(formData.get("failThreshold") ?? 1),
    recoverThreshold: Number(formData.get("recoverThreshold") ?? 1),
    downStatus: string(formData, "downStatus", "MAJOR_OUTAGE") as MonitorInput["downStatus"],
    actionFlipStatus: formData.get("actionFlipStatus") === "on",
    actionRecordMetric: formData.get("actionRecordMetric") === "on",
    actionAutoIncident: formData.get("actionAutoIncident") === "on",
    actionNotify: formData.get("actionNotify") === "on",
    tags: string(formData, "tags").split(",").map((tag) => tag.trim()).filter(Boolean),
    groupName: optionalString(formData, "groupName"),
    heartbeatGraceSec: formData.get("heartbeatGraceSec") ? Number(formData.get("heartbeatGraceSec")) : null,
    dnsRecordType: optionalString(formData, "dnsRecordType") as MonitorInput["dnsRecordType"],
    dnsExpectedValue: optionalString(formData, "dnsExpectedValue"),
  };
}

export async function createMonitor(pageId: string, formData: FormData) {
  const session = await requireCapability("monitor.manage", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const rawInput = monitorInputFromForm(formData);
  const monitor = await createMonitorDomain(session.orgId, pageId, rawInput);
  await writeSupportMutationAudit(session, {
    action: "CREATE_MONITOR",
    targetType: "monitor",
    targetId: monitor.id,
    metadata: { pageId, type: rawInput.type },
  });
  revalidatePath("/organization/monitors");
}

async function monitorContext(monitorId: string) {
  const monitor = await database.selectFrom("monitors").selectAll().where("id", "=", monitorId).executeTakeFirst();
  if (!monitor) throw new Error("Monitor not found");
  return monitor;
}

export async function toggleMonitorEnabled(monitorId: string) {
  const monitor = await monitorContext(monitorId);
  const session = await requireCapability("monitor.manage", monitor.pageId);
  await assertPageInOrg(monitor.pageId, session.orgId);
  const wasEnabled = await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const current = await transaction.selectFrom("monitors").select(["id", "enabled"])
      .where("id", "=", monitor.id).where("pageId", "=", monitor.pageId).forUpdate().executeTakeFirst();
    if (!current) throw new Error("Monitor not found");
    await transaction.updateTable("monitors").set({
      enabled: !current.enabled,
      runRequestedAt: current.enabled ? null : new Date(),
      leaseOwner: null,
      leaseExpiresAt: null,
    }).where("id", "=", current.id).execute();
    if (!current.enabled) await enqueueJobSweep(transaction, JOB_TASKS.monitors);
    return current.enabled;
  });
  await writeSupportMutationAudit(session, {
    action: wasEnabled ? "DISABLE_MONITOR" : "ENABLE_MONITOR",
    targetType: "monitor",
    targetId: monitorId,
    metadata: { pageId: monitor.pageId },
  });
  revalidatePath("/organization/monitors");
}

export async function deleteMonitor(monitorId: string) {
  const monitor = await monitorContext(monitorId);
  const session = await requireCapability("monitor.manage", monitor.pageId);
  await assertPageInOrg(monitor.pageId, session.orgId);
  await deleteMonitorCascade(monitorId, session.orgId, monitor.pageId);
  await writeSupportMutationAudit(session, {
    action: "DELETE_MONITOR", targetType: "monitor", targetId: monitorId,
    metadata: { pageId: monitor.pageId },
  });
  revalidatePath("/organization/monitors");
}

export async function runMonitorNow(monitorId: string) {
  const monitor = await monitorContext(monitorId);
  const session = await requireCapability("monitor.manage", monitor.pageId);
  await assertPageInOrg(monitor.pageId, session.orgId);
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const changed = await transaction.updateTable("monitors").set({
      runRequestedAt: new Date(), leaseOwner: null, leaseExpiresAt: null,
    }).where("id", "=", monitor.id).where("pageId", "=", monitor.pageId)
      .returning("id").executeTakeFirst();
    if (!changed) throw new Error("Monitor state changed; reload and retry");
    await enqueueJobSweep(transaction, JOB_TASKS.monitors);
  });
  await writeSupportMutationAudit(session, {
    action: "RUN_MONITOR_NOW", targetType: "monitor", targetId: monitorId,
    metadata: { pageId: monitor.pageId },
  });
  revalidatePath("/organization/monitors");
}

export async function updateMonitor(monitorId: string, formData: FormData) {
  const monitor = await monitorContext(monitorId);
  const session = await requireCapability("monitor.manage", monitor.pageId);
  await assertPageInOrg(monitor.pageId, session.orgId);
  // The monitor type is fixed after creation; everything else is validated like a new monitor.
  formData.set("type", monitor.type);
  const input = await prepareMonitorInput(monitorInputFromForm(formData));
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    if (input.componentId) {
      const component = await transaction.selectFrom("components").select("id")
        .where("id", "=", input.componentId).where("pageId", "=", monitor.pageId).executeTakeFirst();
      if (!component) throw new Error("Component not found on this page");
    }
    let metricId = monitor.metricId;
    if (input.actionRecordMetric && !metricId) {
      metricId = (await transaction.insertInto("metrics").values({
        pageId: monitor.pageId, componentId: input.componentId, name: `${input.name} response time`,
        suffix: "ms", description: `Automatically recorded by monitor "${input.name}"`, visible: true, decimals: 0,
      }).returning("id").executeTakeFirstOrThrow()).id;
    }
    // A blank secret keeps the stored one unless auth was switched off.
    const authSecret = input.authType === "NONE" ? null
      : input.authSecret ? encryptSecret(input.authSecret) : monitor.authSecret;
    const changed = await transaction.updateTable("monitors").set({
      name: input.name, target: input.type === "HEARTBEAT" ? monitor.target : input.target, port: input.port,
      componentId: input.componentId, method: input.method, requestBody: input.requestBody,
      requestHeaders: input.requestHeaders, expectedStatusRange: input.expectedStatusRange,
      keywordMatch: input.keywordMatch, keywordAbsent: input.keywordAbsent, sslWarnDays: input.sslWarnDays,
      authType: input.authType, authUsername: input.authUsername, authSecret, authHeaderName: input.authHeaderName,
      verifyTls: input.verifyTls, intervalSec: input.intervalSec, timeoutMs: input.timeoutMs,
      failThreshold: input.failThreshold, recoverThreshold: input.recoverThreshold, downStatus: input.downStatus,
      actionFlipStatus: input.actionFlipStatus, actionRecordMetric: input.actionRecordMetric,
      actionAutoIncident: input.actionAutoIncident, actionNotify: input.actionNotify, metricId,
      tags: input.tags ?? [], groupName: input.groupName ?? null, heartbeatGraceSec: input.heartbeatGraceSec ?? 60,
      dnsRecordType: input.dnsRecordType ?? null, dnsExpectedValue: input.dnsExpectedValue ?? null,
      runRequestedAt: new Date(), leaseOwner: null, leaseExpiresAt: null,
    }).where("id", "=", monitor.id).where("pageId", "=", monitor.pageId)
      .returning("id").executeTakeFirst();
    if (!changed) throw new Error("Monitor state changed; reload and retry");
    await enqueueJobSweep(transaction, JOB_TASKS.monitors);
  });
  await writeSupportMutationAudit(session, {
    action: "UPDATE_MONITOR", targetType: "monitor", targetId: monitorId,
    metadata: { pageId: monitor.pageId },
  });
  revalidatePath("/organization/monitors");
}

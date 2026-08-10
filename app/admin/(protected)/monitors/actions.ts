"use server";

import { revalidatePath } from "next/cache";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { deleteMonitorCascade } from "@/lib/cascade";
import { createMonitor as createMonitorDomain, type MonitorInput } from "@/lib/domain/monitors";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import { writeSupportMutationAudit } from "@/lib/support-audit";
import { validateHttpTarget, validateNetworkHost } from "@/lib/target-validation";
import { enqueueJobSweep, JOB_TASKS } from "@/lib/jobs";

function string(formData: FormData, key: string, fallback = "") {
  return String(formData.get(key) ?? fallback);
}

function optionalString(formData: FormData, key: string) {
  const value = string(formData, key).trim();
  return value || null;
}

export async function createMonitor(pageId: string, formData: FormData) {
  const session = await requireCapability("monitor.manage", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const legacyType = string(formData, "type", "HTTP");
  const type = legacyType === "SSL" ? "TLS" : legacyType === "PING" ? "ICMP" : legacyType;
  const rawInput: MonitorInput = {
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
  const monitor = await createMonitorDomain(session.orgId, pageId, rawInput);
  await writeSupportMutationAudit(session, {
    action: "CREATE_MONITOR",
    targetType: "monitor",
    targetId: monitor.id,
    metadata: { pageId, type: rawInput.type },
  });
  revalidatePath("/organization/monitors");
}

export async function addMonitorTemplate(pageId: string, templateId: string, formData: FormData) {
  const session = await requireCapability("monitor.manage", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const [template, existing] = await Promise.all([
    database.selectFrom("monitorTemplates").selectAll()
      .where("id", "=", templateId).where("enabled", "=", true).executeTakeFirst(),
    database.selectFrom("monitors").select("id")
      .where("pageId", "=", pageId).where("templateId", "=", templateId).executeTakeFirst(),
  ]);
  if (!template) throw new Error("Global monitor template is unavailable");
  if (existing) throw new Error("This global monitor is already shown on the page");
  const componentId = optionalString(formData, "componentId");
  const rawInput: MonitorInput = {
    templateId,
    name: template.name,
    type: template.type as MonitorInput["type"],
    componentId,
    target: template.type === "HEARTBEAT" ? "inbound-heartbeat" : template.target,
    port: template.port,
    method: "GET",
    requestBody: null,
    requestHeaders: "",
    expectedStatusRange: template.expectedStatusRange,
    keywordMatch: template.keywordMatch,
    keywordAbsent: null,
    sslWarnDays: template.type === "TLS" ? 14 : null,
    authType: "NONE",
    authUsername: null,
    authSecret: null,
    authHeaderName: null,
    verifyTls: true,
    intervalSec: 300,
    timeoutMs: 10_000,
    failThreshold: 1,
    recoverThreshold: 1,
    downStatus: "MAJOR_OUTAGE",
    actionFlipStatus: Boolean(componentId),
    actionRecordMetric: true,
    actionAutoIncident: false,
    actionNotify: false,
    tags: ["global-template"],
    groupName: template.category,
    heartbeatGraceSec: template.type === "HEARTBEAT" ? 60 : null,
    dnsRecordType: template.type === "DNS" ? "A" : null,
    dnsExpectedValue: null,
  };
  const monitor = await createMonitorDomain(session.orgId, pageId, rawInput);
  await writeSupportMutationAudit(session, {
    action: "ADD_GLOBAL_MONITOR_TO_PAGE",
    targetType: "monitor",
    targetId: monitor.id,
    metadata: { pageId, templateId, templateName: template.name },
  });
  revalidatePath("/organization/monitors");
}

async function monitorContext(monitorId: string) {
  const monitor = await database.selectFrom("monitors").selectAll().where("id", "=", monitorId).executeTakeFirst();
  if (!monitor) throw new Error("Monitor not found");
  return monitor;
}

export async function removeMonitorTemplate(monitorId: string) {
  const monitor = await monitorContext(monitorId);
  if (!monitor.templateId) throw new Error("Attached global monitor not found");
  const session = await requireCapability("monitor.manage", monitor.pageId);
  await assertPageInOrg(monitor.pageId, session.orgId);
  await deleteMonitorCascade(monitorId, session.orgId, monitor.pageId);
  await writeSupportMutationAudit(session, {
    action: "REMOVE_GLOBAL_MONITOR_FROM_PAGE",
    targetType: "monitor",
    targetId: monitorId,
    metadata: { pageId: monitor.pageId, templateId: monitor.templateId },
  });
  revalidatePath("/organization/monitors");
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
  const name = string(formData, "name").trim();
  const target = string(formData, "target").trim();
  const componentId = optionalString(formData, "componentId");
  const intervalSec = Number(formData.get("intervalSec"));
  const timeoutMs = Number(formData.get("timeoutMs"));
  const failThreshold = Number(formData.get("failThreshold"));
  const recoverThreshold = Number(formData.get("recoverThreshold"));
  const groupName = optionalString(formData, "groupName");
  const tags = [...new Set(string(formData, "tags").split(",").map((tag) => tag.trim()).filter(Boolean))];
  if (!name || name.length > 200) throw new Error("Monitor name is required");
  if (!target || target.length > 2_048) throw new Error("Monitor target is required");
  if (!Number.isInteger(intervalSec) || intervalSec < 10 || intervalSec > 86_400) throw new Error("Interval must be between 10 and 86400 seconds");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000) throw new Error("Timeout must be between 100 and 60000 milliseconds");
  if (![failThreshold, recoverThreshold].every((value) => Number.isInteger(value) && value >= 1 && value <= 20)) throw new Error("Thresholds must be between 1 and 20");
  if (tags.length > 20 || tags.some((tag) => tag.length > 50)) throw new Error("Use no more than 20 tags of 50 characters each");
  if (componentId) {
    const component = await database.selectFrom("components").select("id")
      .where("id", "=", componentId).where("pageId", "=", monitor.pageId).executeTakeFirst();
    if (!component) throw new Error("Component not found on this page");
  }
  const allowPrivate = process.env.MONITOR_ALLOW_PRIVATE_TARGETS === "true";
  if (["HTTP", "KEYWORD"].includes(monitor.type)) {
    await validateHttpTarget(target, { allowPrivate });
  } else if (monitor.type !== "HEARTBEAT") {
    const hostname = monitor.type === "TLS" && target.includes("://") ? new URL(target).hostname : target;
    await validateNetworkHost(hostname, allowPrivate);
  }
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const changed = await transaction.updateTable("monitors").set({
      name, target, componentId, intervalSec, timeoutMs, failThreshold, recoverThreshold,
      groupName, tags, runRequestedAt: new Date(), leaseOwner: null, leaseExpiresAt: null,
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

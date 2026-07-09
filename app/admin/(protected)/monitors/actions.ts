"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { requireOrgSession, assertPageInOrg } from "@/lib/admin-guard";
import { deleteMonitorCascade } from "@/lib/cascade";

function str(formData: FormData, key: string, fallback = ""): string {
  return String(formData.get(key) ?? fallback);
}

function optStr(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  return v ? String(v) : null;
}

export async function createMonitor(pageId: string, formData: FormData) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);

  const componentId = str(formData, "componentId");
  const actionRecordMetric = formData.get("actionRecordMetric") === "on";
  const name = str(formData, "name", "New Monitor");

  let metricId: ObjectId | null = null;
  if (actionRecordMetric) {
    metricId = new ObjectId();
    await collections.metrics().insertOne({
      _id: metricId,
      pageId: oid(pageId),
      componentId: componentId ? oid(componentId) : null,
      name: `${name} response time`,
      suffix: "ms",
      description: `Auto-created by monitor "${name}"`,
      visible: true,
      decimals: 0,
    });
  }

  await collections.monitors().insertOne({
    _id: new ObjectId(),
    pageId: oid(pageId),
    componentId: componentId ? oid(componentId) : null,
    name,
    type: str(formData, "type", "HTTP"),
    enabled: true,

    target: str(formData, "target"),
    port: formData.get("port") ? Number(formData.get("port")) : null,
    method: str(formData, "method", "GET"),
    requestBody: optStr(formData, "requestBody"),
    requestHeaders: str(formData, "requestHeaders", ""),

    expectedStatusRange: str(formData, "expectedStatusRange", "200-299"),
    keywordMatch: optStr(formData, "keywordMatch"),
    keywordAbsent: optStr(formData, "keywordAbsent"),
    sslWarnDays: formData.get("sslWarnDays") ? Number(formData.get("sslWarnDays")) : null,

    authType: str(formData, "authType", "NONE"),
    authUsername: optStr(formData, "authUsername"),
    authSecret: optStr(formData, "authSecret"),
    authHeaderName: optStr(formData, "authHeaderName"),
    verifyTls: formData.get("verifyTls") !== "off",

    intervalSec: Number(formData.get("intervalSec") ?? 300),
    timeoutMs: Number(formData.get("timeoutMs") ?? 10000),
    failThreshold: Number(formData.get("failThreshold") ?? 1),
    recoverThreshold: Number(formData.get("recoverThreshold") ?? 1),
    downStatus: str(formData, "downStatus", "MAJOR_OUTAGE"),

    actionFlipStatus: formData.get("actionFlipStatus") === "on",
    actionRecordMetric,
    actionAutoIncident: formData.get("actionAutoIncident") === "on",
    actionNotify: formData.get("actionNotify") === "on",
    metricId,

    lastCheckedAt: null,
    lastLatencyMs: null,
    lastOk: null,
    lastError: null,
    consecutiveFails: 0,
    consecutiveOks: 0,
    currentIncidentId: null,
    createdAt: new Date(),
  });

  revalidatePath("/admin/monitors");
}

export async function toggleMonitorEnabled(monitorId: string) {
  const session = await requireOrgSession();
  const monitorDoc = await collections.monitors().findOne({ _id: oid(monitorId) });
  if (!monitorDoc) return;
  const monitor = toId(monitorDoc);
  await assertPageInOrg(monitor.pageId, session.orgId);
  await collections.monitors().updateOne({ _id: oid(monitorId) }, { $set: { enabled: !monitorDoc.enabled } });
  revalidatePath("/admin/monitors");
}

export async function deleteMonitor(monitorId: string) {
  const session = await requireOrgSession();
  const monitorDoc = await collections.monitors().findOne({ _id: oid(monitorId) });
  if (!monitorDoc) return;
  const monitor = toId(monitorDoc);
  await assertPageInOrg(monitor.pageId, session.orgId);
  await deleteMonitorCascade(monitorId);
  revalidatePath("/admin/monitors");
}

/**
 * Checks now run exclusively in the standalone Python monitor-service
 * (monitor-service/), which polls `monitors` directly. "Run now" just clears
 * lastCheckedAt so the monitor is picked up on the service's next poll,
 * rather than the app running the check itself.
 */
export async function runMonitorNow(monitorId: string) {
  const session = await requireOrgSession();
  const monitorDoc = await collections.monitors().findOne({ _id: oid(monitorId) });
  if (!monitorDoc) return;
  const monitor = toId(monitorDoc);
  await assertPageInOrg(monitor.pageId, session.orgId);

  await collections.monitors().updateOne({ _id: oid(monitorId) }, { $set: { lastCheckedAt: null } });
  revalidatePath("/admin/monitors");
}

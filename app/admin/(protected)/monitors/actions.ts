"use server";

import { revalidatePath } from "next/cache";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { collections } from "@/lib/db";
import { createMonitor as createMonitorDomain, type MonitorInput } from "@/lib/domain/monitors";
import { deleteMonitorCascade, withTransaction } from "@/lib/cascade";
import { oid } from "@/lib/mongo-utils";
import { validateHttpTarget, validateNetworkHost } from "@/lib/target-validation";
import { writeSupportMutationAudit } from "@/lib/support-audit";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";

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
  revalidatePath("/admin/monitors");
}

export async function toggleMonitorEnabled(monitorId: string) {
  const monitor = await collections.monitors().findOne({ _id: oid(monitorId) });
  if (!monitor) throw new Error("Monitor not found");
  const pageId = monitor.pageId.toHexString();
  const session = await requireCapability("monitor.manage", pageId);
  await assertPageInOrg(pageId, session.orgId);
  let wasEnabled = monitor.enabled;
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const page = await collections.pages().findOne(
      { _id: monitor.pageId, orgId: oid(session.orgId) },
      { session: databaseSession }
    );
    if (!page) throw new Error("Page not found in your organization");
    const currentMonitor = await collections.monitors().findOne(
      { _id: monitor._id, pageId: page._id },
      { session: databaseSession }
    );
    if (!currentMonitor) throw new Error("Monitor not found");
    wasEnabled = currentMonitor.enabled;
    const changed = await collections.monitors().updateOne(
      { _id: currentMonitor._id, pageId: page._id, enabled: wasEnabled },
      { $set: { enabled: !wasEnabled, leaseOwner: null, leaseExpiresAt: null } },
      { session: databaseSession }
    );
    if (!changed.modifiedCount) {
      throw new Error("Monitor state changed; reload and retry");
    }
  });
  await writeSupportMutationAudit(session, {
    action: wasEnabled ? "DISABLE_MONITOR" : "ENABLE_MONITOR",
    targetType: "monitor",
    targetId: monitorId,
    metadata: { pageId },
  });
  revalidatePath("/admin/monitors");
}

export async function deleteMonitor(monitorId: string) {
  const monitor = await collections.monitors().findOne({ _id: oid(monitorId) });
  if (!monitor) throw new Error("Monitor not found");
  const pageId = monitor.pageId.toHexString();
  const session = await requireCapability("monitor.manage", pageId);
  await assertPageInOrg(pageId, session.orgId);
  await deleteMonitorCascade(monitorId, session.orgId, pageId);
  await writeSupportMutationAudit(session, {
    action: "DELETE_MONITOR",
    targetType: "monitor",
    targetId: monitorId,
    metadata: { pageId },
  });
  revalidatePath("/admin/monitors");
}

export async function runMonitorNow(monitorId: string) {
  const monitor = await collections.monitors().findOne({ _id: oid(monitorId) });
  if (!monitor) throw new Error("Monitor not found");
  const pageId = monitor.pageId.toHexString();
  const session = await requireCapability("monitor.manage", pageId);
  await assertPageInOrg(pageId, session.orgId);
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const page = await collections.pages().findOne(
      { _id: monitor.pageId, orgId: oid(session.orgId) },
      { session: databaseSession }
    );
    if (!page) throw new Error("Page not found in your organization");
    const currentMonitor = await collections.monitors().findOne(
      { _id: monitor._id, pageId: page._id },
      { session: databaseSession }
    );
    if (!currentMonitor) throw new Error("Monitor not found");
    const changed = await collections.monitors().updateOne(
      { _id: currentMonitor._id, pageId: page._id },
      { $set: { runRequestedAt: new Date(), leaseOwner: null, leaseExpiresAt: null } },
      { session: databaseSession }
    );
    if (!changed.matchedCount) {
      throw new Error("Monitor state changed; reload and retry");
    }
  });
  await writeSupportMutationAudit(session, {
    action: "RUN_MONITOR_NOW",
    targetType: "monitor",
    targetId: monitorId,
    metadata: { pageId },
  });
  revalidatePath("/admin/monitors");
}

export async function updateMonitor(monitorId: string, formData: FormData) {
  const monitor = await collections.monitors().findOne({ _id: oid(monitorId) });
  if (!monitor) throw new Error("Monitor not found");
  const pageId = monitor.pageId.toHexString();
  const session = await requireCapability("monitor.manage", pageId);
  await assertPageInOrg(pageId, session.orgId);

  const name = string(formData, "name").trim();
  const target = string(formData, "target").trim();
  const componentId = optionalString(formData, "componentId");
  const intervalSec = Number(formData.get("intervalSec"));
  const timeoutMs = Number(formData.get("timeoutMs"));
  const failThreshold = Number(formData.get("failThreshold"));
  const recoverThreshold = Number(formData.get("recoverThreshold"));
  const groupName = optionalString(formData, "groupName");
  const tags = [...new Set(
    string(formData, "tags").split(",").map((tag) => tag.trim()).filter(Boolean)
  )];

  if (!name || name.length > 200) throw new Error("Monitor name is required");
  if (!target || target.length > 2_048) throw new Error("Monitor target is required");
  if (!Number.isInteger(intervalSec) || intervalSec < 10 || intervalSec > 86_400) {
    throw new Error("Interval must be between 10 and 86400 seconds");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000) {
    throw new Error("Timeout must be between 100 and 60000 milliseconds");
  }
  if (![failThreshold, recoverThreshold].every((value) => Number.isInteger(value) && value >= 1 && value <= 20)) {
    throw new Error("Thresholds must be between 1 and 20");
  }
  if (tags.length > 20 || tags.some((tag) => tag.length > 50)) {
    throw new Error("Use no more than 20 tags of 50 characters each");
  }
  if (componentId) {
    const component = await collections.components().findOne({
      _id: oid(componentId),
      pageId: monitor.pageId,
    });
    if (!component) throw new Error("Component not found on this page");
  }
  const allowPrivate = process.env.MONITOR_ALLOW_PRIVATE_TARGETS === "true";
  if (["HTTP", "KEYWORD"].includes(monitor.type)) {
    await validateHttpTarget(target, { allowPrivate });
  } else if (monitor.type !== "HEARTBEAT") {
    const hostname = monitor.type === "TLS" && target.includes("://") ? new URL(target).hostname : target;
    await validateNetworkHost(hostname, allowPrivate);
  }

  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const page = await collections.pages().findOne(
      { _id: monitor.pageId, orgId: oid(session.orgId) },
      { session: databaseSession }
    );
    if (!page) throw new Error("Page not found in your organization");
    const currentMonitor = await collections.monitors().findOne(
      { _id: monitor._id, pageId: page._id },
      { session: databaseSession }
    );
    if (!currentMonitor) throw new Error("Monitor not found");
    if (componentId) {
      const component = await collections.components().findOne(
        { _id: oid(componentId), pageId: page._id },
        { session: databaseSession }
      );
      if (!component) throw new Error("Component not found on this page");
    }
    const changed = await collections.monitors().updateOne(
      { _id: currentMonitor._id, pageId: page._id },
      {
        $set: {
          name,
          target,
          componentId: componentId ? oid(componentId) : null,
          intervalSec,
          timeoutMs,
          failThreshold,
          recoverThreshold,
          groupName,
          tags,
          runRequestedAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      },
      { session: databaseSession }
    );
    if (!changed.matchedCount) {
      throw new Error("Monitor state changed; reload and retry");
    }
  });
  await writeSupportMutationAudit(session, {
    action: "UPDATE_MONITOR",
    targetType: "monitor",
    targetId: monitorId,
    metadata: { pageId },
  });
  revalidatePath("/admin/monitors");
}

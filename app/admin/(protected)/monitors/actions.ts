"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { encryptSecret } from "@/lib/encryption";
import { resolveAuthConfig } from "@/lib/monitor-auth";
import { deleteMonitorCascade } from "@/lib/cascade";
import { sameKind } from "@/lib/monitor-kinds";
import { assertProxyInOrg, createMonitor as createMonitorDomain, isHttpLike, prepareMonitorInput, type MonitorInput } from "@/lib/domain/monitors";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import { writeSupportMutationAudit } from "@/lib/support-audit";
import { enqueueJobSweep, JOB_TASKS } from "@/lib/jobs";
import { isDatabaseId } from "@/lib/database-id";
import { BULK_MONITOR_LIMIT, bulkMonitorDeletePhrase, isBulkMonitorIntent, matchesBulkMonitorDeletePhrase, monitorCountLabel } from "@/lib/monitor-bulk";

function string(formData: FormData, key: string, fallback = "") {
  return String(formData.get(key) ?? fallback);
}

function optionalString(formData: FormData, key: string) {
  const value = string(formData, key).trim();
  return value || null;
}

function authConfigFromForm(formData: FormData, authType: string): MonitorInput["authConfig"] {
  if (authType === "OAUTH2") {
    return {
      kind: "OAUTH2", tokenUrl: string(formData, "oauthTokenUrl"), clientId: string(formData, "oauthClientId"),
      clientSecret: string(formData, "oauthClientSecret"), scope: string(formData, "oauthScope"),
      audience: string(formData, "oauthAudience"), credentialsIn: string(formData, "oauthCredentialsIn", "body") as "body" | "basic",
    };
  }
  if (authType === "MTLS") {
    return {
      kind: "MTLS", cert: string(formData, "mtlsCert"), key: string(formData, "mtlsKey"),
      passphrase: string(formData, "mtlsPassphrase"), ca: string(formData, "mtlsCa"),
    };
  }
  return null;
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
    authConfig: authConfigFromForm(formData, string(formData, "authType", "NONE")),
    verifyTls: formData.get("ignoreTls") !== "on",
    cacheBuster: formData.get("cacheBuster") === "on",
    ipFamily: string(formData, "ipFamily", "AUTO") as MonitorInput["ipFamily"],
    upsideDown: formData.get("upsideDown") === "on",
    proxyId: optionalString(formData, "proxyId"),
    saveErrorResponse: formData.get("saveErrorResponse") === "on",
    certExpiryNotify: formData.get("certExpiryNotify") === "on",
    domainExpiryNotify: formData.get("domainExpiryNotify") === "on",
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
  redirect(`/organization/monitors?pageId=${pageId}`);
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
  // The kind of monitor is fixed after creation. Inside a kind the type may change (Keyword becomes
  // HTTP, TCP gains or drops its certificate check); everything else is validated like a new monitor.
  const requestedType = string(formData, "type", monitor.type);
  formData.set("type", sameKind(monitor.type, requestedType) ? requestedType : monitor.type);
  const input = await prepareMonitorInput(monitorInputFromForm(formData));
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    await assertProxyInOrg(input.proxyId, session.orgId, transaction);
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
    // A blank secret keeps the stored one unless the auth type no longer uses it.
    const authSecret = !["BASIC", "BEARER", "HEADER"].includes(input.authType) ? null
      : input.authSecret ? encryptSecret(input.authSecret) : monitor.authSecret;
    if (input.type === "HEARTBEAT" && input.authType !== "NONE" && !input.authSecret && (!monitor.authSecret || monitor.authType !== input.authType)) {
      throw new Error(`Enter the ${input.authType === "BASIC" ? "password" : "token"} your job will send to the heartbeat URL`);
    }
    const authConfigCiphertext = resolveAuthConfig(input.authType, input.authConfig, monitor.authConfigCiphertext);
    const changed = await transaction.updateTable("monitors").set({
      name: input.name, type: input.type, target: input.type === "HEARTBEAT" ? monitor.target : input.target, port: input.port,
      componentId: input.componentId, method: input.method, requestBody: input.requestBody,
      requestHeaders: input.requestHeaders, expectedStatusRange: input.expectedStatusRange,
      keywordMatch: input.keywordMatch, keywordAbsent: input.keywordAbsent, sslWarnDays: input.sslWarnDays,
      authType: input.authType, authUsername: input.authUsername, authSecret, authConfigCiphertext, authHeaderName: input.authHeaderName,
      verifyTls: input.verifyTls, cacheBuster: input.cacheBuster ?? false, ipFamily: input.ipFamily ?? "AUTO",
      upsideDown: input.upsideDown ?? false, proxyId: isHttpLike(input.type) ? input.proxyId ?? null : null,
      saveErrorResponse: isHttpLike(input.type) && (input.saveErrorResponse ?? false),
      certExpiryNotify: isHttpLike(input.type) && (input.certExpiryNotify ?? false), domainExpiryNotify: input.type !== "HEARTBEAT" && (input.domainExpiryNotify ?? false),
      // A changed target is a different certificate and domain: forget what was already warned about.
      ...(input.target !== monitor.target ? { certNotifiedFor: null, domainNotifiedFor: null, certExpiresAt: null, domainExpiresAt: null, domainCheckedAt: null } : {}),
      intervalSec: input.intervalSec, timeoutMs: input.timeoutMs,
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
  redirect(`/organization/monitors?pageId=${monitor.pageId}`);
}

/** Bulk run, pause, resume or delete over monitors of one page, from the monitors list. */
export async function bulkMonitorAction(pageId: string, formData: FormData) {
  const intent = formData.get("intent");
  if (!isBulkMonitorIntent(intent)) throw new Error("Choose a bulk action");
  const monitorIds = [...new Set(formData.getAll("monitorId").map(String))];
  if (!monitorIds.length) throw new Error("Select at least one monitor");
  if (monitorIds.length > BULK_MONITOR_LIMIT) throw new Error(`Select ${BULK_MONITOR_LIMIT} monitors or fewer`);
  if (!isDatabaseId(pageId) || !monitorIds.every(isDatabaseId)) throw new Error("One or more selected monitors are invalid. Reload and try again.");
  const session = await requireCapability("monitor.manage", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const members = await database.selectFrom("monitors").select("id").where("id", "in", monitorIds).where("pageId", "=", pageId).execute();
  if (members.length !== monitorIds.length) throw new Error("Some selected monitors no longer exist. Reload and try again.");
  const label = monitorCountLabel(monitorIds.length);
  let message: string;

  if (intent === "delete") {
    if (!matchesBulkMonitorDeletePhrase(String(formData.get("confirmation") ?? ""), monitorIds.length)) {
      throw new Error(`Type "${bulkMonitorDeletePhrase(monitorIds.length)}" to confirm`);
    }
    let deleted = 0;
    try {
      for (const id of monitorIds) {
        await deleteMonitorCascade(id, session.orgId, pageId);
        await writeSupportMutationAudit(session, { action: "DELETE_MONITOR", targetType: "monitor", targetId: id, metadata: { pageId } });
        deleted += 1;
      }
    } catch (error) {
      revalidatePath("/organization/monitors");
      throw new Error(`Deleted ${deleted} of ${monitorIds.length}: ${error instanceof Error ? error.message : "unexpected error"}`);
    }
    message = `Deleted ${label}`;
  } else {
    const changed = await withDatabaseTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(session.orgId, transaction);
      // Filters match the UI: pausing needs a running monitor, resuming a paused one, and a check needs a running one.
      const query = transaction.updateTable("monitors").where("id", "in", monitorIds).where("pageId", "=", pageId)
        .where("enabled", "=", intent !== "resume");
      const rows = await query.set(
        intent === "pause" ? { enabled: false, runRequestedAt: null, leaseOwner: null, leaseExpiresAt: null }
          : intent === "resume" ? { enabled: true, runRequestedAt: new Date(), leaseOwner: null, leaseExpiresAt: null }
            : { runRequestedAt: new Date(), leaseOwner: null, leaseExpiresAt: null },
      ).returning("id").execute();
      if (intent !== "pause" && rows.length) await enqueueJobSweep(transaction, JOB_TASKS.monitors);
      return rows;
    });
    const action = intent === "pause" ? "DISABLE_MONITOR" : intent === "resume" ? "ENABLE_MONITOR" : "RUN_MONITOR_NOW";
    for (const row of changed) await writeSupportMutationAudit(session, { action, targetType: "monitor", targetId: row.id, metadata: { pageId } });
    const verb = intent === "pause" ? "Paused" : intent === "resume" ? "Resumed" : "Queued a check for";
    const skipped = monitorIds.length - changed.length;
    const reason = intent === "resume" ? "already running" : intent === "pause" ? "already paused" : "paused";
    message = `${verb} ${monitorCountLabel(changed.length)}${skipped ? `, skipped ${skipped} ${reason}` : ""}`;
  }
  revalidatePath("/organization/monitors");
  return message;
}

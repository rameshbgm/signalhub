"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import {
  requireCapability,
  assertPageInOrg,
  assertComponentInPage,
  assertGroupInPage,
} from "@/lib/admin-guard";
import { deleteComponentCascade } from "@/lib/cascade";
import { setComponentStatus } from "@/lib/component-status";
import { generateAutomationToken } from "@/lib/tokens";
import { withTransaction } from "@/lib/cascade";
import { COMPONENT_STATUSES, type ComponentStatus } from "@/lib/status";
import {
  createPreparedMonitor,
  prepareMonitorInput,
  type MonitorInput,
} from "@/lib/domain/monitors";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";

export async function createGroup(pageId: string, formData: FormData) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Group name is required");
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const page = await collections.pages().findOne(
      { _id: oid(pageId), orgId: oid(session.orgId) },
      { session: databaseSession }
    );
    if (!page) throw new Error("Page not found in your organization");
    const count = await collections.componentGroups().countDocuments(
      { pageId: oid(pageId) },
      { session: databaseSession }
    );
    await collections.componentGroups().insertOne({
      _id: new ObjectId(),
      pageId: oid(pageId),
      name,
      description: "",
      order: count,
      collapsed: false,
    }, { session: databaseSession });
  });
  revalidatePath(`/admin/pages/${pageId}`);
}

export async function deleteGroup(pageId: string, groupId: string) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  await assertGroupInPage(groupId, pageId);
  await withTransaction(async (dbSession) => {
    await fenceActiveOrganizationMutation(session.orgId, dbSession);
    const page = await collections.pages().findOne(
      { _id: oid(pageId), orgId: oid(session.orgId) },
      { session: dbSession }
    );
    if (!page) throw new Error("Page not found in your organization");
    const group = await collections.componentGroups().findOne(
      { _id: oid(groupId), pageId: page._id },
      { session: dbSession }
    );
    if (!group) throw new Error("Component group not found");
    await collections
      .components()
      .updateMany({ pageId: page._id, groupId: group._id }, { $set: { groupId: null } }, { session: dbSession });
    const removed = await collections
      .componentGroups()
      .deleteOne({ _id: group._id, pageId: page._id }, { session: dbSession });
    if (!removed.deletedCount) throw new Error("Component group changed; reload and retry");
  });
  revalidatePath(`/admin/pages/${pageId}`);
}

export async function createComponent(pageId: string, formData: FormData) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const templateId = String(formData.get("monitorTemplateId") ?? "");
  const template = templateId
    ? await collections.monitorTemplates().findOne({ _id: oid(templateId), enabled: true })
    : null;
  if (templateId && !template) throw new Error("Monitor template not found");
  const groupId = String(formData.get("groupId") ?? "");
  if (groupId) await assertGroupInPage(groupId, pageId);
  const name = String(formData.get("name") ?? template?.name ?? "").trim();
  if (!name) throw new Error("Component name is required");
  const automationToken = generateAutomationToken();
  const componentId = new ObjectId();
  const now = new Date();
  const preparedMonitor = template
    ? await prepareMonitorInput({
        name: `${template.name} availability`,
        type: template.type as MonitorInput["type"],
        componentId: componentId.toHexString(),
        target: template.target,
        port: template.port,
        method: "GET",
        requestBody: null,
        requestHeaders: "{}",
        expectedStatusRange: template.expectedStatusRange,
        keywordMatch: template.keywordMatch,
        keywordAbsent: null,
        sslWarnDays: template.type === "TLS" ? 30 : null,
        authType: "NONE",
        authUsername: null,
        authSecret: null,
        authHeaderName: null,
        verifyTls: true,
        intervalSec: 60,
        timeoutMs: 10_000,
        failThreshold: 3,
        recoverThreshold: 2,
        downStatus: "MAJOR_OUTAGE",
        actionFlipStatus: true,
        actionRecordMetric: template.type !== "HEARTBEAT",
        actionAutoIncident: true,
        actionNotify: true,
      })
    : null;

  await withTransaction(async (dbSession) => {
    await fenceActiveOrganizationMutation(session.orgId, dbSession);
    const currentPage = await collections.pages().findOne(
      { _id: oid(pageId), orgId: oid(session.orgId) },
      { session: dbSession }
    );
    if (!currentPage) throw new Error("Page not found in your organization");
    if (groupId) {
      const currentGroup = await collections.componentGroups().findOne(
        { _id: oid(groupId), pageId: currentPage._id },
        { session: dbSession }
      );
      if (!currentGroup) throw new Error("Component group not found on this page");
    }
    if (templateId) {
      const currentTemplate = await collections.monitorTemplates().findOne(
        { _id: oid(templateId), enabled: true },
        { session: dbSession }
      );
      if (!currentTemplate) throw new Error("Monitor template is no longer available");
    }
    const count = await collections.components().countDocuments(
      { pageId: currentPage._id },
      { session: dbSession }
    );
    await collections.components().insertOne({
      _id: componentId,
      pageId: oid(pageId),
      groupId: groupId ? oid(groupId) : null,
      name,
      description: String(formData.get("description") ?? template?.description ?? ""),
      status: "OPERATIONAL",
      order: count,
      visible: true,
      showUptime: true,
      manualStatus: "OPERATIONAL",
      isThirdParty: Boolean(template),
      thirdPartyProvider: template?.name ?? null,
      automationTokenHash: automationToken.hash,
      automationTokenPrefix: automationToken.prefix,
      automationTokenLastFour: automationToken.lastFour,
      createdAt: now,
    }, { session: dbSession });
    await collections.componentStatusEvents().insertOne({
      _id: new ObjectId(),
      componentId,
      status: "OPERATIONAL",
      startedAt: now,
      endedAt: null,
      isMaintenance: false,
    }, { session: dbSession });
    if (preparedMonitor) {
      await createPreparedMonitor(
        session.orgId,
        pageId,
        preparedMonitor,
        dbSession
      );
    }
  });
  revalidatePath(`/admin/pages/${pageId}`);
}

export async function updateComponentStatus(pageId: string, componentId: string, formData: FormData) {
  const session = await requireCapability("component.update", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const status = String(formData.get("status") ?? "OPERATIONAL");
  if (!COMPONENT_STATUSES.includes(status as ComponentStatus)) throw new Error("Invalid component status");
  await assertComponentInPage(componentId, pageId);

  await setComponentStatus(oid(componentId), status);
  revalidatePath(`/admin/pages/${pageId}`);
  const pageDoc = await collections.pages().findOne({ _id: oid(pageId) });
  revalidatePath(`/${pageDoc?.slug}`);
}

export async function updateComponentDetails(pageId: string, componentId: string, formData: FormData) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  await assertComponentInPage(componentId, pageId);
  const groupId = String(formData.get("groupId") ?? "");
  if (groupId) await assertGroupInPage(groupId, pageId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Component name is required");
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const page = await collections.pages().findOne(
      { _id: oid(pageId), orgId: oid(session.orgId) },
      { session: databaseSession }
    );
    if (!page) throw new Error("Page not found in your organization");
    if (groupId) {
      const group = await collections.componentGroups().findOne(
        { _id: oid(groupId), pageId: page._id },
        { session: databaseSession }
      );
      if (!group) throw new Error("Component group not found on this page");
    }
    const changed = await collections.components().updateOne(
      { _id: oid(componentId), pageId: page._id },
      {
        $set: {
          name,
          description: String(formData.get("description") ?? ""),
          order: Number(formData.get("order") ?? 0),
          visible: formData.get("visible") === "on",
          showUptime: formData.get("showUptime") === "on",
          groupId: groupId ? oid(groupId) : null,
        },
      },
      { session: databaseSession }
    );
    if (!changed.matchedCount) throw new Error("Component not found on this page");
  });
  revalidatePath(`/admin/pages/${pageId}`);
}

export async function deleteComponent(pageId: string, componentId: string) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  await assertComponentInPage(componentId, pageId);
  await deleteComponentCascade(componentId, session.orgId, pageId);
  revalidatePath(`/admin/pages/${pageId}`);
}

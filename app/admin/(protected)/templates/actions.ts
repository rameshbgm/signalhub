"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import {
  requireIncidentManager,
  assertPageInOrg,
  assertComponentInPage,
} from "@/lib/admin-guard";
import { IMPACTS, INCIDENT_STATUSES, type Impact, type IncidentStatus } from "@/lib/status";
import { withTransaction } from "@/lib/cascade";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";

const TEMPLATE_KINDS = ["INCIDENT", "UPDATE", "RESOLUTION", "MAINTENANCE", "POSTMORTEM"] as const;
type TemplateKind = (typeof TEMPLATE_KINDS)[number];

function templateVariables(body: string) {
  return [...new Set([...body.matchAll(/\{\{\s*([a-zA-Z][\w.-]*)\s*\}\}/g)].map((match) => match[1]))];
}

export async function createTemplateGroup(pageId: string, formData: FormData) {
  const session = await requireIncidentManager();
  await assertPageInOrg(pageId, session.orgId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Template group name is required");
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const page = await collections.pages().findOne(
      { _id: oid(pageId), orgId: oid(session.orgId) },
      { session: databaseSession }
    );
    if (!page) throw new Error("Page not found in your organization");
    await collections.templateGroups().insertOne({
      _id: new ObjectId(),
      pageId: page._id,
      name,
    }, { session: databaseSession });
  });
  revalidatePath("/admin/templates");
}

export async function createTemplate(pageId: string, formData: FormData) {
  const session = await requireIncidentManager();
  await assertPageInOrg(pageId, session.orgId);
  const componentIds = formData.getAll("componentIds").map(String);
  if (new Set(componentIds).size !== componentIds.length) throw new Error("Components must be unique");
  for (const componentId of componentIds) await assertComponentInPage(componentId, pageId);
  const groupId = String(formData.get("groupId") ?? "");
  if (groupId) {
    const group = await collections.templateGroups().findOne({
      _id: oid(groupId),
      pageId: oid(pageId),
    });
    if (!group) throw new Error("Template group not found on this page");
  }
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const defaultStatus = String(formData.get("defaultStatus") ?? "INVESTIGATING") as IncidentStatus;
  const defaultImpact = String(formData.get("defaultImpact") ?? "MINOR") as Impact;
  const kind = String(formData.get("kind") ?? "INCIDENT") as TemplateKind;
  if (!title || !body) throw new Error("Template title and body are required");
  if (!INCIDENT_STATUSES.includes(defaultStatus)) throw new Error("Invalid incident status");
  if (!IMPACTS.includes(defaultImpact)) throw new Error("Invalid impact");
  if (!TEMPLATE_KINDS.includes(kind)) throw new Error("Invalid template kind");
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const page = await collections.pages().findOne(
      { _id: oid(pageId), orgId: oid(session.orgId) },
      { session: databaseSession }
    );
    if (!page) throw new Error("Page not found in your organization");
    if (groupId) {
      const group = await collections.templateGroups().findOne(
        { _id: oid(groupId), pageId: page._id },
        { session: databaseSession }
      );
      if (!group) throw new Error("Template group not found on this page");
    }
    const componentCount = componentIds.length
      ? await collections.components().countDocuments(
          { _id: { $in: componentIds.map(oid) }, pageId: page._id },
          { session: databaseSession }
        )
      : 0;
    if (componentCount !== componentIds.length) {
      throw new Error("One or more components are unavailable");
    }
    await collections.incidentTemplates().insertOne({
      _id: new ObjectId(),
      pageId: page._id,
      groupId: groupId ? oid(groupId) : null,
      title,
      body,
      defaultStatus,
      defaultImpact,
      defaultComponentIds: JSON.stringify(componentIds),
      kind,
      variables: templateVariables(body),
      notifyByDefault: formData.get("notifyByDefault") === "on",
      archivedAt: null,
      updatedAt: new Date(),
      createdAt: new Date(),
    }, { session: databaseSession });
  });
  revalidatePath("/admin/templates");
}

export async function deleteTemplate(templateId: string) {
  const session = await requireIncidentManager();
  const templateDoc = await collections.incidentTemplates().findOne({ _id: oid(templateId) });
  if (!templateDoc) throw new Error("Template not found");
  const template = toId(templateDoc);
  await assertPageInOrg(template.pageId, session.orgId);
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const page = await collections.pages().findOne(
      { _id: templateDoc.pageId, orgId: oid(session.orgId) },
      { session: databaseSession }
    );
    if (!page) throw new Error("Page not found in your organization");
    const currentTemplate = await collections.incidentTemplates().findOne(
      { _id: oid(templateId), pageId: page._id },
      { session: databaseSession }
    );
    if (!currentTemplate) throw new Error("Template not found");
    const changed = await collections.incidentTemplates().updateOne(
      { _id: currentTemplate._id, pageId: page._id },
      { $set: { archivedAt: new Date(), updatedAt: new Date() } },
      { session: databaseSession }
    );
    if (!changed.matchedCount) throw new Error("Template state changed; reload and retry");
  });
  revalidatePath("/admin/templates");
}

export async function duplicateTemplate(templateId: string) {
  const session = await requireIncidentManager();
  const source = await collections.incidentTemplates().findOne({ _id: oid(templateId) });
  if (!source) throw new Error("Template not found");
  await assertPageInOrg(source.pageId.toHexString(), session.orgId);
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const currentSource = await collections.incidentTemplates().findOne(
      { _id: source._id },
      { session: databaseSession }
    );
    const page = currentSource
      ? await collections.pages().findOne(
          { _id: currentSource.pageId, orgId: oid(session.orgId) },
          { session: databaseSession }
        )
      : null;
    if (!currentSource || !page) throw new Error("Template not found");
    await collections.incidentTemplates().insertOne({
      ...currentSource,
      _id: new ObjectId(),
      title: `${currentSource.title} copy`,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }, { session: databaseSession });
  });
  revalidatePath("/admin/templates");
}

export async function updateTemplate(templateId: string, formData: FormData) {
  const session = await requireIncidentManager();
  const source = await collections.incidentTemplates().findOne({ _id: oid(templateId) });
  if (!source) throw new Error("Template not found");
  await assertPageInOrg(source.pageId.toHexString(), session.orgId);
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const kind = String(formData.get("kind") ?? source.kind ?? "INCIDENT") as TemplateKind;
  if (!title || !body) throw new Error("Template title and body are required");
  if (!TEMPLATE_KINDS.includes(kind)) throw new Error("Invalid template kind");
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const page = await collections.pages().findOne(
      { _id: source.pageId, orgId: oid(session.orgId) },
      { session: databaseSession }
    );
    if (!page) throw new Error("Page not found in your organization");
    const currentTemplate = await collections.incidentTemplates().findOne(
      { _id: source._id, pageId: page._id },
      { session: databaseSession }
    );
    if (!currentTemplate) throw new Error("Template not found");
    const changed = await collections.incidentTemplates().updateOne(
      { _id: currentTemplate._id, pageId: page._id },
      {
        $set: {
          title,
          body,
          kind,
          variables: templateVariables(body),
          notifyByDefault: formData.get("notifyByDefault") === "on",
          updatedAt: new Date(),
        },
      },
      { session: databaseSession }
    );
    if (!changed.matchedCount) throw new Error("Template state changed; reload and retry");
  });
  revalidatePath("/admin/templates");
}

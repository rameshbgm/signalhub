"use server";

import { revalidatePath } from "next/cache";
import { requireIncidentManager, assertPageInOrg, assertComponentInPage } from "@/lib/admin-guard";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { IMPACTS, INCIDENT_STATUSES, type Impact, type IncidentStatus } from "@/lib/status";

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
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    await transaction.insertInto("templateGroups").values({ pageId, name }).execute();
  });
  revalidatePath("/organization/templates");
}

export async function createTemplate(pageId: string, formData: FormData) {
  const session = await requireIncidentManager();
  await assertPageInOrg(pageId, session.orgId);
  const componentIds = formData.getAll("componentIds").map(String);
  if (new Set(componentIds).size !== componentIds.length) throw new Error("Components must be unique");
  for (const componentId of componentIds) await assertComponentInPage(componentId, pageId);
  const groupId = String(formData.get("groupId") ?? "") || null;
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const defaultStatus = String(formData.get("defaultStatus") ?? "INVESTIGATING") as IncidentStatus;
  const defaultImpact = String(formData.get("defaultImpact") ?? "MINOR") as Impact;
  const kind = String(formData.get("kind") ?? "INCIDENT") as TemplateKind;
  if (!title || !body) throw new Error("Template title and body are required");
  if (!INCIDENT_STATUSES.includes(defaultStatus)) throw new Error("Invalid incident status");
  if (!IMPACTS.includes(defaultImpact)) throw new Error("Invalid impact");
  if (!TEMPLATE_KINDS.includes(kind)) throw new Error("Invalid template kind");

  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    if (groupId) {
      const group = await transaction.selectFrom("templateGroups").select("id")
        .where("id", "=", groupId).where("pageId", "=", pageId).executeTakeFirst();
      if (!group) throw new Error("Template group not found on this page");
    }
    if (componentIds.length) {
      const row = await transaction.selectFrom("components")
        .select(({ fn }) => fn.countAll<number>().as("count"))
        .where("id", "in", componentIds).where("pageId", "=", pageId).executeTakeFirstOrThrow();
      if (Number(row.count) !== componentIds.length) throw new Error("One or more components are unavailable");
    }
    await transaction.insertInto("incidentTemplates").values({
      pageId,
      groupId,
      title,
      body,
      defaultStatus,
      defaultImpact,
      defaultComponentIds: componentIds,
      kind,
      variables: templateVariables(body),
      notifyByDefault: formData.get("notifyByDefault") === "on",
      archivedAt: null,
    }).execute();
  });
  revalidatePath("/organization/templates");
}

export async function deleteTemplate(templateId: string) {
  const session = await requireIncidentManager();
  const template = await database.selectFrom("incidentTemplates").select(["id", "pageId"])
    .where("id", "=", templateId).executeTakeFirst();
  if (!template) throw new Error("Template not found");
  await assertPageInOrg(template.pageId, session.orgId);
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const changed = await transaction.updateTable("incidentTemplates")
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where("id", "=", template.id).where("pageId", "=", template.pageId)
      .returning("id").executeTakeFirst();
    if (!changed) throw new Error("Template state changed; reload and retry");
  });
  revalidatePath("/organization/templates");
}

export async function duplicateTemplate(templateId: string) {
  const session = await requireIncidentManager();
  const source = await database.selectFrom("incidentTemplates").selectAll()
    .where("id", "=", templateId).executeTakeFirst();
  if (!source) throw new Error("Template not found");
  await assertPageInOrg(source.pageId, session.orgId);
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const current = await transaction.selectFrom("incidentTemplates").selectAll()
      .where("id", "=", source.id).where("pageId", "=", source.pageId).executeTakeFirst();
    if (!current) throw new Error("Template not found");
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...copy } = current;
    await transaction.insertInto("incidentTemplates").values({
      ...copy,
      title: `${current.title} copy`,
      archivedAt: null,
    }).execute();
  });
  revalidatePath("/organization/templates");
}

export async function updateTemplate(templateId: string, formData: FormData) {
  const session = await requireIncidentManager();
  const source = await database.selectFrom("incidentTemplates").select(["id", "pageId", "kind"])
    .where("id", "=", templateId).executeTakeFirst();
  if (!source) throw new Error("Template not found");
  await assertPageInOrg(source.pageId, session.orgId);
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const kind = String(formData.get("kind") ?? source.kind) as TemplateKind;
  if (!title || !body) throw new Error("Template title and body are required");
  if (!TEMPLATE_KINDS.includes(kind)) throw new Error("Invalid template kind");
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const changed = await transaction.updateTable("incidentTemplates").set({
      title,
      body,
      kind,
      variables: templateVariables(body),
      notifyByDefault: formData.get("notifyByDefault") === "on",
      updatedAt: new Date(),
    }).where("id", "=", source.id).where("pageId", "=", source.pageId)
      .returning("id").executeTakeFirst();
    if (!changed) throw new Error("Template state changed; reload and retry");
  });
  revalidatePath("/organization/templates");
}

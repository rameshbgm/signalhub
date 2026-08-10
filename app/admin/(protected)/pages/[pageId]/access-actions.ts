"use server";

import { revalidatePath } from "next/cache";
import { requireCapability, assertPageInOrg, assertComponentInPage } from "@/lib/admin-guard";
import { hashPassword } from "@/lib/auth";
import { canonicalizeEmail } from "@/lib/identity";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/lib/postgres/client";

async function validateComponents(pageId: string, componentIds: string[]) {
  if (new Set(componentIds).size !== componentIds.length) throw new Error("Components must be unique");
  for (const componentId of componentIds) await assertComponentInPage(componentId, pageId);
}

async function validateComponentsInTransaction(
  transaction: DatabaseTransaction,
  pageId: string,
  componentIds: string[]
) {
  if (!componentIds.length) return;
  const row = await transaction.selectFrom("components")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("id", "in", componentIds).where("pageId", "=", pageId).executeTakeFirstOrThrow();
  if (Number(row.count) !== componentIds.length) throw new Error("One or more components are unavailable");
}

export async function createAccessGroup(pageId: string, formData: FormData) {
  const session = await requireCapability("page.configure", pageId);
  const page = await assertPageInOrg(pageId, session.orgId);
  if (page.type !== "AUDIENCE") throw new Error("Audience groups require an audience page");
  const componentIds = formData.getAll("componentIds").map(String);
  await validateComponents(pageId, componentIds);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Group name is required");
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    await validateComponentsInTransaction(transaction, pageId, componentIds);
    await transaction.insertInto("pageAccessGroups").values({ pageId, name, componentIds }).execute();
  });
  revalidatePath(`/organization/pages/${pageId}`);
}

export async function deleteAccessGroup(pageId: string, groupId: string) {
  const session = await requireCapability("page.configure", pageId);
  const page = await assertPageInOrg(pageId, session.orgId);
  if (page.type !== "AUDIENCE") throw new Error("Audience groups require an audience page");
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const removed = await transaction.deleteFrom("pageAccessGroups")
      .where("id", "=", groupId).where("pageId", "=", pageId)
      .returning("id").executeTakeFirst();
    if (!removed) throw new Error("Audience group not found or changed");
  });
  revalidatePath(`/organization/pages/${pageId}`);
}

export async function createAccessUser(pageId: string, formData: FormData) {
  const session = await requireCapability("page.configure", pageId);
  const page = await assertPageInOrg(pageId, session.orgId);
  if (page.type !== "AUDIENCE") throw new Error("Audience users require an audience page");
  const email = canonicalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const groupId = String(formData.get("groupId") ?? "") || null;
  const componentIds = formData.getAll("componentIds").map(String);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address");
  if (password.length < 12) throw new Error("Audience passwords must contain at least 12 characters");
  await validateComponents(pageId, componentIds);
  const passwordHash = await hashPassword(password);
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    if (groupId) {
      const group = await transaction.selectFrom("pageAccessGroups").select("id")
        .where("id", "=", groupId).where("pageId", "=", pageId).executeTakeFirst();
      if (!group) throw new Error("Audience group not found");
    }
    await validateComponentsInTransaction(transaction, pageId, componentIds);
    await transaction.insertInto("pageAccessUsers").values({
      pageId,
      email,
      passwordHash,
      groupId,
      componentIds,
    }).execute();
  }).catch((error) => {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      throw new Error("An audience user with this email already exists");
    }
    throw error;
  });
  revalidatePath(`/organization/pages/${pageId}`);
}

export async function deleteAccessUser(pageId: string, userId: string) {
  const session = await requireCapability("page.configure", pageId);
  const page = await assertPageInOrg(pageId, session.orgId);
  if (page.type !== "AUDIENCE") throw new Error("Audience users require an audience page");
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const removed = await transaction.deleteFrom("pageAccessUsers")
      .where("id", "=", userId).where("pageId", "=", pageId)
      .returning("id").executeTakeFirst();
    if (!removed) throw new Error("Audience user not found");
  });
  revalidatePath(`/organization/pages/${pageId}`);
}

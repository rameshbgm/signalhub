"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { hashPassword } from "@/lib/auth";
import {
  requireCapability,
  assertPageInOrg,
  assertComponentInPage,
} from "@/lib/admin-guard";
import { canonicalizeEmail } from "@/lib/identity";
import { withTransaction } from "@/lib/cascade";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";

async function validateComponents(pageId: string, componentIds: string[]) {
  if (new Set(componentIds).size !== componentIds.length) throw new Error("Components must be unique");
  for (const componentId of componentIds) await assertComponentInPage(componentId, pageId);
}

export async function createAccessGroup(pageId: string, formData: FormData) {
  const session = await requireCapability("page.configure", pageId);
  const page = await assertPageInOrg(pageId, session.orgId);
  if (page.type !== "AUDIENCE") throw new Error("Audience groups require an audience page");
  const componentIds = formData.getAll("componentIds").map(String);
  await validateComponents(pageId, componentIds);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Group name is required");
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const currentPage = await collections.pages().findOne(
      {
        _id: oid(pageId),
        orgId: oid(session.orgId),
        type: "AUDIENCE",
      },
      { session: databaseSession }
    );
    if (!currentPage) throw new Error("Audience page not found");
    const componentCount = componentIds.length
      ? await collections.components().countDocuments(
          { _id: { $in: componentIds.map(oid) }, pageId: currentPage._id },
          { session: databaseSession }
        )
      : 0;
    if (componentCount !== componentIds.length) {
      throw new Error("One or more components are unavailable");
    }
    await collections.pageAccessGroups().insertOne({
      _id: new ObjectId(),
      pageId: oid(pageId),
      name,
      componentIds: JSON.stringify(componentIds),
    }, { session: databaseSession });
  });
  revalidatePath(`/admin/pages/${pageId}`);
}

export async function deleteAccessGroup(pageId: string, groupId: string) {
  const session = await requireCapability("page.configure", pageId);
  const page = await assertPageInOrg(pageId, session.orgId);
  if (page.type !== "AUDIENCE") throw new Error("Audience groups require an audience page");
  const group = await collections.pageAccessGroups().findOne({ _id: oid(groupId), pageId: oid(pageId) });
  if (!group) throw new Error("Audience group not found");
  await withTransaction(async (dbSession) => {
    await fenceActiveOrganizationMutation(session.orgId, dbSession);
    const currentPage = await collections.pages().findOne(
      {
        _id: oid(pageId),
        orgId: oid(session.orgId),
        type: "AUDIENCE",
      },
      { session: dbSession }
    );
    if (!currentPage) throw new Error("Audience page not found");
    const currentGroup = await collections.pageAccessGroups().findOne(
      { _id: oid(groupId), pageId: currentPage._id },
      { session: dbSession }
    );
    if (!currentGroup) throw new Error("Audience group not found");
    await collections.pageAccessUsers().updateMany(
      { pageId: currentPage._id, groupId: currentGroup._id },
      { $set: { groupId: null } },
      { session: dbSession }
    );
    const removed = await collections.pageAccessGroups().deleteOne(
      { _id: currentGroup._id, pageId: currentPage._id },
      { session: dbSession }
    );
    if (!removed.deletedCount) throw new Error("Audience group changed; reload and retry");
  });
  revalidatePath(`/admin/pages/${pageId}`);
}

export async function createAccessUser(pageId: string, formData: FormData) {
  const session = await requireCapability("page.configure", pageId);
  const page = await assertPageInOrg(pageId, session.orgId);
  if (page.type !== "AUDIENCE") throw new Error("Audience users require an audience page");
  const email = canonicalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const groupId = String(formData.get("groupId") ?? "");
  const componentIds = formData.getAll("componentIds").map(String);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address");
  if (password.length < 12) throw new Error("Audience passwords must contain at least 12 characters");
  if (groupId) {
    const group = await collections.pageAccessGroups().findOne({ _id: oid(groupId), pageId: oid(pageId) });
    if (!group) throw new Error("Audience group not found");
  }
  await validateComponents(pageId, componentIds);

  const passwordHash = await hashPassword(password);
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const currentPage = await collections.pages().findOne(
      {
        _id: oid(pageId),
        orgId: oid(session.orgId),
        type: "AUDIENCE",
      },
      { session: databaseSession }
    );
    if (!currentPage) throw new Error("Audience page not found");
    if (groupId) {
      const group = await collections.pageAccessGroups().findOne(
        { _id: oid(groupId), pageId: currentPage._id },
        { session: databaseSession }
      );
      if (!group) throw new Error("Audience group not found");
    }
    const componentCount = componentIds.length
      ? await collections.components().countDocuments(
          { _id: { $in: componentIds.map(oid) }, pageId: currentPage._id },
          { session: databaseSession }
        )
      : 0;
    if (componentCount !== componentIds.length) {
      throw new Error("One or more components are unavailable");
    }
    await collections.pageAccessUsers().insertOne({
      _id: new ObjectId(),
      pageId: oid(pageId),
      email,
      passwordHash,
      groupId: groupId ? oid(groupId) : null,
      componentIds: JSON.stringify(componentIds),
      createdAt: new Date(),
    }, { session: databaseSession });
  });
  revalidatePath(`/admin/pages/${pageId}`);
}

export async function deleteAccessUser(pageId: string, userId: string) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const page = await collections.pages().findOne(
      {
        _id: oid(pageId),
        orgId: oid(session.orgId),
        type: "AUDIENCE",
      },
      { session: databaseSession }
    );
    if (!page) throw new Error("Audience page not found");
    const removed = await collections.pageAccessUsers().deleteOne(
      { _id: oid(userId), pageId: page._id },
      { session: databaseSession }
    );
    if (!removed.deletedCount) throw new Error("Audience user not found");
  });
  revalidatePath(`/admin/pages/${pageId}`);
}

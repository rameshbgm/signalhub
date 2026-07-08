"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { requireOrgSession } from "@/lib/admin-guard";
import { generateApiKey, generateWebhookSecret } from "@/lib/tokens";
import { assertPageInOrg } from "@/lib/admin-guard";

export async function createApiKey(formData: FormData) {
  const session = await requireOrgSession();
  const name = String(formData.get("name") ?? "API Key");
  await collections.apiKeys().insertOne({
    _id: new ObjectId(),
    orgId: oid(session.orgId),
    name,
    key: generateApiKey(),
    createdAt: new Date(),
    lastUsedAt: null,
  });
  await collections.auditLogs().insertOne({
    _id: new ObjectId(),
    orgId: oid(session.orgId),
    actor: session.email,
    action: "CREATE_API_KEY",
    target: name,
    createdAt: new Date(),
  });
  revalidatePath("/admin/api-keys");
}

export async function revokeApiKey(keyId: string) {
  const session = await requireOrgSession();
  const keyDoc = await collections.apiKeys().findOne({ _id: oid(keyId) });
  if (!keyDoc || keyDoc.orgId.toHexString() !== session.orgId) return;
  await collections.apiKeys().deleteOne({ _id: oid(keyId) });
  await collections.auditLogs().insertOne({
    _id: new ObjectId(),
    orgId: oid(session.orgId),
    actor: session.email,
    action: "REVOKE_API_KEY",
    target: keyDoc.name,
    createdAt: new Date(),
  });
  revalidatePath("/admin/api-keys");
}

export async function createWebhookEndpoint(pageId: string, formData: FormData) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  const url = String(formData.get("url") ?? "");
  await collections.webhookEndpoints().insertOne({
    _id: new ObjectId(),
    pageId: oid(pageId),
    url,
    secret: generateWebhookSecret(),
    active: true,
    createdAt: new Date(),
  });
  revalidatePath("/admin/api-keys");
}

export async function deleteWebhookEndpoint(endpointId: string) {
  const session = await requireOrgSession();
  const epDoc = await collections.webhookEndpoints().findOne({ _id: oid(endpointId) });
  if (!epDoc) return;
  await assertPageInOrg(epDoc.pageId.toHexString(), session.orgId);
  await collections.webhookEndpoints().deleteOne({ _id: oid(endpointId) });
  revalidatePath("/admin/api-keys");
}

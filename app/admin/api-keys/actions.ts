"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireOrgSession } from "@/lib/admin-guard";
import { generateApiKey, generateWebhookSecret } from "@/lib/tokens";
import { assertPageInOrg } from "@/lib/admin-guard";

export async function createApiKey(formData: FormData) {
  const session = await requireOrgSession();
  const name = String(formData.get("name") ?? "API Key");
  await prisma.apiKey.create({ data: { orgId: session.orgId, name, key: generateApiKey() } });
  await prisma.auditLog.create({ data: { orgId: session.orgId, actor: session.email, action: "CREATE_API_KEY", target: name } });
  revalidatePath("/admin/api-keys");
}

export async function revokeApiKey(keyId: string) {
  const session = await requireOrgSession();
  const key = await prisma.apiKey.findUnique({ where: { id: keyId } });
  if (!key || key.orgId !== session.orgId) return;
  await prisma.apiKey.delete({ where: { id: keyId } });
  await prisma.auditLog.create({ data: { orgId: session.orgId, actor: session.email, action: "REVOKE_API_KEY", target: key.name } });
  revalidatePath("/admin/api-keys");
}

export async function createWebhookEndpoint(pageId: string, formData: FormData) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  const url = String(formData.get("url") ?? "");
  await prisma.webhookEndpoint.create({ data: { pageId, url, secret: generateWebhookSecret() } });
  revalidatePath("/admin/api-keys");
}

export async function deleteWebhookEndpoint(endpointId: string) {
  const session = await requireOrgSession();
  const ep = await prisma.webhookEndpoint.findUnique({ where: { id: endpointId } });
  if (!ep) return;
  await assertPageInOrg(ep.pageId, session.orgId);
  await prisma.webhookEndpoint.delete({ where: { id: endpointId } });
  revalidatePath("/admin/api-keys");
}

"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/admin-guard";
import { encryptSecret } from "@/lib/encryption";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { withDatabaseTransaction } from "@/lib/postgres/client";
import { proxyInputSchema } from "@/lib/proxies";
import { canManageProxies } from "@/lib/proxy-shared";
import { writeSupportMutationAudit } from "@/lib/support-audit";

const HTTP_MONITOR_TYPES = ["HTTP", "KEYWORD"];

async function requireProxyManager() {
  const session = await requireCapability("monitor.manage");
  if (!canManageProxies(session)) throw new Error("Proxies are shared by every page. Only members with access to all pages can change them.");
  return session;
}

/** Creates a proxy (`proxyId` null) or updates one. A blank password keeps the stored one. */
export async function saveProxy(proxyId: string | null, formData: FormData) {
  const session = await requireProxyManager();
  const flag = (name: string) => formData.get(name) === "on";
  const input = proxyInputSchema.parse({
    protocol: String(formData.get("protocol") ?? "HTTP"),
    host: String(formData.get("host") ?? ""),
    port: Number(formData.get("port")),
    hasAuth: flag("hasAuth"),
    username: String(formData.get("username") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    enabled: flag("enabled"),
    isDefault: flag("isDefault"),
    applyToAll: flag("applyToAll"),
  });
  if (input.hasAuth && !input.username) throw new Error("Enter the proxy username, or turn authentication off");

  const id = await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const existing = proxyId
      ? await transaction.selectFrom("proxies").selectAll().where("id", "=", proxyId).where("orgId", "=", session.orgId).forUpdate().executeTakeFirst()
      : null;
    if (proxyId && !existing) throw new Error("Proxy not found");
    const values = {
      protocol: input.protocol, host: input.host, port: input.port,
      authUsername: input.hasAuth ? input.username : null,
      authSecret: !input.hasAuth ? null : input.password ? encryptSecret(input.password) : existing?.authSecret ?? null,
      enabled: input.enabled, isDefault: input.isDefault, updatedAt: new Date(),
    };
    // One default per organization: clear the old one first so the unique index holds.
    if (input.isDefault) {
      await transaction.updateTable("proxies").set({ isDefault: false }).where("orgId", "=", session.orgId).where("isDefault", "=", true).execute();
    }
    const saved = existing
      ? await transaction.updateTable("proxies").set(values).where("id", "=", existing.id).returning("id").executeTakeFirstOrThrow()
      : await transaction.insertInto("proxies").values({ orgId: session.orgId, ...values }).returning("id").executeTakeFirstOrThrow();
    if (input.applyToAll) {
      await transaction.updateTable("monitors").set({ proxyId: saved.id })
        .where("type", "in", HTTP_MONITOR_TYPES)
        .where("pageId", "in", transaction.selectFrom("pages").select("id").where("orgId", "=", session.orgId))
        .execute();
    }
    return saved.id;
  });
  await writeSupportMutationAudit(session, {
    action: proxyId ? "UPDATE_PROXY" : "CREATE_PROXY", targetType: "proxy", targetId: id,
    metadata: { protocol: input.protocol, applyToAll: input.applyToAll },
  });
  revalidatePath("/organization/monitors");
}

export async function deleteProxy(proxyId: string) {
  const session = await requireProxyManager();
  const deleted = await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    return transaction.deleteFrom("proxies").where("id", "=", proxyId).where("orgId", "=", session.orgId).returning("id").executeTakeFirst();
  });
  if (!deleted) throw new Error("Proxy not found");
  await writeSupportMutationAudit(session, { action: "DELETE_PROXY", targetType: "proxy", targetId: proxyId });
  revalidatePath("/organization/monitors");
}

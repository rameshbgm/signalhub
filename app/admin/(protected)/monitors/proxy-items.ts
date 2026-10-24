import { listOrgProxies } from "@/lib/proxies";
import { canManageProxies, type ProxyItem } from "@/lib/proxy-shared";
import { deleteProxy, saveProxy } from "./proxy-actions";

/**
 * The organization's proxies with their actions bound, plus the action that creates a new one.
 * `createProxy` is undefined for page-scoped members, who may pick a proxy but not change them.
 */
export async function proxyItems(session: { orgId: string; role: string; pageIds: string[] | null }): Promise<{ proxies: ProxyItem[]; createProxy?: (formData: FormData) => Promise<void> }> {
  const proxies = await listOrgProxies(session.orgId);
  return {
    proxies: proxies.map((proxy) => ({ ...proxy, save: saveProxy.bind(null, proxy.id), remove: deleteProxy.bind(null, proxy.id) })),
    createProxy: canManageProxies(session) ? saveProxy.bind(null, null) : undefined,
  };
}

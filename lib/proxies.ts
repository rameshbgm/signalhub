import { isIP } from "node:net";
import { z } from "zod";
import { decryptSecret } from "@/lib/encryption";
import { database } from "@/lib/postgres/client";
import type { MonitorRow, ProxyRow } from "@/lib/postgres/schema";
import { PROXY_PROTOCOLS, type ProxyView } from "@/lib/proxy-shared";
import type { ProxyConfig } from "@/lib/proxy-tunnel";

const HOSTNAME = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;

export const proxyInputSchema = z.object({
  protocol: z.enum(PROXY_PROTOCOLS),
  host: z.string().trim().transform((host) => host.replace(/^\[|\]$/g, ""))
    .refine((host) => isIP(host) !== 0 || HOSTNAME.test(host), "Proxy server must be a hostname or IP address, without a scheme or port"),
  port: z.number().int().min(1).max(65_535),
  hasAuth: z.boolean(),
  username: z.string().max(255),
  password: z.string().max(1_000),
  enabled: z.boolean(),
  isDefault: z.boolean(),
  applyToAll: z.boolean(),
});

export function proxyView(row: ProxyRow): ProxyView {
  return {
    id: row.id, protocol: row.protocol, host: row.host, port: row.port, enabled: row.enabled, isDefault: row.isDefault,
    username: row.authUsername, hasPassword: Boolean(row.authSecret),
  };
}

export async function listOrgProxies(orgId: string) {
  const rows = await database.selectFrom("proxies").selectAll().where("orgId", "=", orgId).orderBy("createdAt", "asc").execute();
  return rows.map(proxyView);
}

/**
 * The proxy a monitor should use for this check. A disabled proxy is skipped, so
 * the monitor reaches its target directly until the proxy is turned back on.
 */
export async function loadMonitorProxy(monitor: Pick<MonitorRow, "proxyId">): Promise<ProxyConfig | null> {
  if (!monitor.proxyId) return null;
  const row = await database.selectFrom("proxies").selectAll().where("id", "=", monitor.proxyId).where("enabled", "=", true).executeTakeFirst();
  if (!row) return null;
  return {
    protocol: row.protocol, host: row.host, port: row.port, username: row.authUsername,
    password: row.authSecret ? decryptSecret(row.authSecret) : null,
  };
}

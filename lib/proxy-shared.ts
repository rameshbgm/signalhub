import type { ProxyRow } from "@/lib/postgres/schema";

/** Client-safe proxy helpers; the database-backed ones live in lib/proxies.ts. */
export const PROXY_PROTOCOLS = ["HTTP", "HTTPS", "SOCKS4", "SOCKS5"] as const;

/** What the form may see of a proxy: whether a password is stored, never the password. */
export type ProxyView = Pick<ProxyRow, "id" | "protocol" | "host" | "port" | "enabled" | "isDefault"> & {
  username: string | null;
  hasPassword: boolean;
};

/**
 * Proxies are shared by every page, and "apply to all" rewrites monitors across the organization,
 * so only members who can reach every page may change them. Page-scoped members can still pick one.
 */
export function canManageProxies(session: { role: string; pageIds: string[] | null }) {
  return session.role === "ADMIN" || session.pageIds === null;
}

type ServerAction = (formData: FormData) => Promise<void>;

/** A proxy plus its server actions, bound on the server (a client cannot bind server actions itself). */
export type ProxyItem = ProxyView & { save: ServerAction; remove: ServerAction };

export function proxyLabel(proxy: Pick<ProxyRow, "protocol" | "host" | "port">) {
  return `${proxy.protocol.toLowerCase()}://${proxy.host.includes(":") ? `[${proxy.host}]` : proxy.host}:${proxy.port}`;
}

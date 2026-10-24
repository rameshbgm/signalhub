import { database, type DatabaseExecutor } from "@/lib/postgres/client";
import { parseCidrs, setStoredProxyTrust, type ProxyTrustSettings } from "@/lib/proxy-trust";

export async function loadProxyTrust(executor: DatabaseExecutor = database): Promise<ProxyTrustSettings> {
  const row = await executor
    .selectFrom("platformConfiguration")
    .select(["proxyTrustMode", "proxyTrustedHops", "proxyTrustedCidrs"])
    .where("id", "=", "global")
    .executeTakeFirst();
  // A stored list that no longer parses (hand-edited row) is dropped, never half applied.
  const stored = parseCidrs(row?.proxyTrustedCidrs ?? []);
  const settings: ProxyTrustSettings = {
    mode: row?.proxyTrustMode ?? "auto",
    hops: row?.proxyTrustedHops ?? 1,
    cidrs: stored.invalid.length ? [] : stored.cidrs,
  };
  setStoredProxyTrust(settings);
  return settings;
}

export async function saveProxyTrust(executor: DatabaseExecutor, settings: ProxyTrustSettings, updatedBy: string | null) {
  const changes = {
    proxyTrustMode: settings.mode, proxyTrustedHops: settings.hops, proxyTrustedCidrs: [...(settings.cidrs ?? [])],
    updatedBy, updatedAt: new Date(),
  };
  await executor.insertInto("platformConfiguration")
    .values({ id: "global", ...changes })
    .onConflict((conflict) => conflict.column("id").doUpdateSet(changes))
    .execute();
  setStoredProxyTrust(settings);
}

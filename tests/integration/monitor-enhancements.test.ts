import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Disposable database only; see tests/integration/postgresql.test.ts. */
const url = process.env.INTEGRATION_DATABASE_URL;
const databaseName = url ? new URL(url).pathname.replace(/^\//, "") : "";
const enabled = Boolean(url) && /test/i.test(databaseName);
if (enabled) process.env.DATABASE_URL = url;

describe.skipIf(!enabled)("monitor enhancements schema (migration 019)", () => {
  let client: typeof import("../../lib/postgres/client");
  let settings: typeof import("../../lib/monitoring-settings");
  let orgId = "";
  let otherOrgId = "";
  let userId = "";
  let monitorId = "";

  beforeAll(async () => {
    await (await import("../../lib/migrations")).runMigrations();
    client = await import("../../lib/postgres/client");
    settings = await import("../../lib/monitoring-settings");
    const { database } = client;
    const stamp = Date.now();
    orgId = (await database.insertInto("organizations").values({ name: "Enh", slug: `enh-${stamp}` } as never).returning("id").executeTakeFirstOrThrow()).id;
    otherOrgId = (await database.insertInto("organizations").values({ name: "Enh2", slug: `enh2-${stamp}` } as never).returning("id").executeTakeFirstOrThrow()).id;
    userId = (await database.insertInto("users").values({
      username: `enh-${stamp}`, canonicalUsername: `enh-${stamp}`, email: `enh-${stamp}@example.invalid`, canonicalEmail: `enh-${stamp}@example.invalid`, name: "Enh",
    } as never).returning("id").executeTakeFirstOrThrow()).id;
    const page = await database.insertInto("pages").values({ orgId, name: "Enh", slug: `enh-${stamp}`, type: "PUBLIC" } as never).returning("id").executeTakeFirstOrThrow();
    monitorId = (await database.insertInto("monitors").values({
      pageId: page.id, name: "m", type: "HTTP", target: "https://example.com", intervalSec: 60, timeoutMs: 1000, downStatus: "MAJOR_OUTAGE",
    } as never).returning("id").executeTakeFirstOrThrow()).id;
  }, 60_000);

  afterAll(async () => {
    await client?.postgresPool.end();
  });

  it("defaults the new monitor columns so existing monitors keep working", async () => {
    const monitor = await client.database.selectFrom("monitors").selectAll().where("id", "=", monitorId).executeTakeFirstOrThrow();
    expect(monitor).toMatchObject({
      cacheBuster: false, ipFamily: "AUTO", upsideDown: false, saveErrorResponse: false, proxyId: null, authConfigCiphertext: null,
      certExpiryNotify: false, domainExpiryNotify: false, certExpiresAt: null, domainCheckedAt: null,
    });
  });

  it("rejects an unknown IP family", async () => {
    await expect(client.database.updateTable("monitors").set({ ipFamily: "IPV5" as never }).where("id", "=", monitorId).execute()).rejects.toThrow();
  });

  it("allows one default proxy per organization and clears monitor references when a proxy is deleted", async () => {
    const { database } = client;
    const base = { protocol: "HTTP" as const, host: "proxy.internal", port: 3128 };
    const first = await database.insertInto("proxies").values({ orgId, ...base, isDefault: true }).returning("id").executeTakeFirstOrThrow();
    await expect(database.insertInto("proxies").values({ orgId, ...base, isDefault: true }).execute()).rejects.toThrow();
    // Another organization has its own default, and non-default proxies are unlimited.
    await database.insertInto("proxies").values({ orgId: otherOrgId, ...base, isDefault: true }).execute();
    await database.insertInto("proxies").values({ orgId, ...base, port: 3129 }).execute();

    await database.updateTable("monitors").set({ proxyId: first.id }).where("id", "=", monitorId).execute();
    await database.deleteFrom("proxies").where("id", "=", first.id).execute();
    const monitor = await database.selectFrom("monitors").select("proxyId").where("id", "=", monitorId).executeTakeFirstOrThrow();
    expect(monitor.proxyId).toBeNull();
  });

  it("rejects out-of-range ports and unknown protocols", async () => {
    const { database } = client;
    await expect(database.insertInto("proxies").values({ orgId, protocol: "HTTP", host: "h", port: 0 }).execute()).rejects.toThrow();
    await expect(database.insertInto("proxies").values({ orgId, protocol: "FTP" as never, host: "h", port: 21 }).execute()).rejects.toThrow();
  });

  it("resolves expiry warning days from the organization, then the platform default, then the built-in fallback", async () => {
    const { database } = client;
    expect(await settings.effectiveMonitoringSettings(orgId)).toEqual({ certExpiryWarnDays: 14, domainExpiryWarnDays: 30 });
    await database.insertInto("monitoringSettings").values({ orgId: null, certExpiryWarnDays: 21, domainExpiryWarnDays: 60, updatedBy: userId }).execute();
    expect(await settings.effectiveMonitoringSettings(orgId)).toEqual({ certExpiryWarnDays: 21, domainExpiryWarnDays: 60 });
    await database.insertInto("monitoringSettings").values({ orgId, certExpiryWarnDays: 5, domainExpiryWarnDays: 400, updatedBy: userId }).execute();
    // The organization's value wins; an out-of-bounds stored value is clamped.
    expect(await settings.effectiveMonitoringSettings(orgId)).toEqual({ certExpiryWarnDays: 5, domainExpiryWarnDays: 365 });
    expect(await settings.effectiveMonitoringSettings(otherOrgId)).toEqual({ certExpiryWarnDays: 21, domainExpiryWarnDays: 60 });
    await database.deleteFrom("monitoringSettings").where("orgId", "is", null).execute();
  });

  it("stores a saved response on a check", async () => {
    const { database } = client;
    await (await import("../../lib/monitor-checks")).ensureMonitorCheckPartitions();
    await database.insertInto("monitorChecks").values({ monitorId, checkedAt: new Date(), ok: false, latencyMs: 5, statusCode: 503, error: "boom", response: '{"error":"db"}' }).execute();
    const row = await database.selectFrom("monitorChecks").select("response").where("monitorId", "=", monitorId).executeTakeFirstOrThrow();
    expect(row.response).toBe('{"error":"db"}');
  });
});

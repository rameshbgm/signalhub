import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = Boolean(url) && /test/i.test(new URL(url!).pathname);
if (url && !enabled) throw new Error("Retention integration tests require a disposable database with test in its name.");
if (enabled) process.env.DATABASE_URL = url;

describe.skipIf(!enabled)("retention cleanup", () => {
  let client: typeof import("../../lib/postgres/client");
  let retention: typeof import("../../lib/retention");
  const now = new Date();
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);

  beforeAll(async () => {
    client = await import("../../lib/postgres/client");
    retention = await import("../../lib/retention");
    await (await import("../../lib/migrations")).runMigrations();
  }, 60_000);
  afterAll(async () => { await client?.postgresPool.end(); });

  it("uses 90/90/365/365 defaults and honors saved platform and organization overrides", async () => {
    expect(await retention.effectiveRetention()).toEqual({ monitorChecksDays: 90, analyticsDays: 90, notificationLogsDays: 365, resolvedIncidentsDays: 365 });
    const { database: db } = client;
    const username = `retention-${randomUUID()}`;
    const user = await db.insertInto("users").values({ username, canonicalUsername: username, email: `${username}@example.invalid`, canonicalEmail: `${username}@example.invalid`, name: "Retention operator" } as never).returning("id").executeTakeFirstOrThrow();
    const org = await db.insertInto("organizations").values({ name: "Long retention", slug: `retention-${randomUUID()}` } as never).returning("id").executeTakeFirstOrThrow();
    await db.insertInto("retentionPolicies").values({ orgId: null, ...retention.FALLBACK_RETENTION, analyticsDays: 100, updatedBy: user.id }).execute();
    expect((await retention.effectiveRetention()).analyticsDays).toBe(100);
    await db.insertInto("retentionPolicies").values({ orgId: org.id, monitorChecksDays: 180, analyticsDays: 180, notificationLogsDays: 730, resolvedIncidentsDays: 730, updatedBy: user.id }).execute();
    expect((await retention.effectiveRetention(org.id)).analyticsDays).toBe(180);
    await db.deleteFrom("retentionPolicies").where("orgId", "is", null).execute();
  });

  it("expires old rows, keeps boundary and current rows, and preserves active work and longer tenant windows", async () => {
    const { database: db } = client;
    const orgs = await db.selectFrom("organizations").select("id").where("name", "=", "Long retention").execute();
    const normal = await db.insertInto("organizations").values({ name: "Default retention", slug: `normal-${randomUUID()}` } as never).returning("id").executeTakeFirstOrThrow();
    const pages: string[] = [];
    const monitors: string[] = [];
    const metrics: string[] = [];
    const components: string[] = [];
    const incidents: string[] = [];
    for (const org of [normal, orgs[0]]) {
      const page = await db.insertInto("pages").values({ orgId: org.id, name: "Retention", slug: `retention-${randomUUID()}`, type: "PUBLIC" } as never).returning("id").executeTakeFirstOrThrow();
      pages.push(page.id);
      const monitor = await db.insertInto("monitors").values({ pageId: page.id, name: "Reference", type: "HTTP", target: "https://example.invalid", intervalSec: 900, timeoutMs: 1000, downStatus: "MAJOR_OUTAGE" } as never).returning("id").executeTakeFirstOrThrow();
      monitors.push(monitor.id);
      const metric = await db.insertInto("metrics").values({ pageId: page.id, name: "Latency" } as never).returning("id").executeTakeFirstOrThrow();
      metrics.push(metric.id);
      const component = await db.insertInto("components").values({ pageId: page.id, name: "Service", automationTokenHash: randomUUID(), automationTokenPrefix: "unused", automationTokenLastFour: "test" } as never).returning("id").executeTakeFirstOrThrow();
      components.push(component.id);
      for (const days of [91, 90, 1]) {
        await db.insertInto("monitorChecks").values({ monitorId: monitor.id, checkedAt: ago(days), ok: true } as never).execute();
        await db.insertInto("metricPoints").values({ metricId: metric.id, timestamp: ago(days), value: days }).execute();
        await db.insertInto("analyticsDaily").values({ id: randomUUID(), pageId: page.id, date: ago(days).toISOString().slice(0, 10), updatedAt: now, expiresAt: ago(-1) }).execute();
      }
      for (const days of [366, 365, 1]) {
        await db.insertInto("notificationLogs").values({ pageId: page.id, channel: "EMAIL", contact: "test@example.invalid", subject: "Test", body: "Test", status: "SENT", createdAt: ago(days) } as never).execute();
        await db.insertInto("componentStatusEvents").values({ componentId: component.id, status: "OPERATIONAL", startedAt: ago(days + 1), endedAt: ago(days), isMaintenance: false, note: "Closed" }).execute();
      }
      await db.insertInto("componentStatusEvents").values({ componentId: component.id, status: "PARTIAL_OUTAGE", startedAt: ago(400), endedAt: null, isMaintenance: false, note: "Active" }).execute();
      for (const status of ["SENT", "DEAD_LETTER", "PENDING", "PROCESSING", "FAILED", "BLOCKED"] as const) {
        await db.insertInto("notificationJobs").values({ pageId: page.id, channel: "EMAIL", contact: "test@example.invalid", subject: "Test", body: "Test", eventType: "INCIDENT_UPDATE", payload: {}, deduplicationKey: randomUUID(), status, maxAttempts: 3, nextAttemptAt: now, updatedAt: ago(366) } as never).execute();
      }
      const incident = await db.insertInto("incidents").values({ pageId: page.id, name: "Old active incident", status: "INVESTIGATING", impact: "MINOR", createdAt: ago(400) } as never).returning("id").executeTakeFirstOrThrow();
      incidents.push(incident.id);
    }
    const expiredSaml = `browser:${randomUUID()}`;
    const activeSaml = `browser:${randomUUID()}`;
    await db.insertInto("samlRequests").values([
      { id: expiredSaml, value: "expired-nonce-hash", expiresAt: ago(1) },
      { id: activeSaml, value: "active-nonce-hash", expiresAt: ago(-1) },
    ]).execute();
    await db.deleteFrom("maintenanceLeases").where("id", "=", "retention").execute();
    expect(await retention.runRetentionSweep("retention-test", now)).toBe(true);
    expect(await retention.runRetentionSweep("second-worker", now)).toBe(false);
    expect(await db.selectFrom("samlRequests").select("id").where("id", "=", expiredSaml).executeTakeFirst()).toBeUndefined();
    expect(await db.selectFrom("samlRequests").select("id").where("id", "=", activeSaml).executeTakeFirst()).toBeDefined();

    for (let index = 0; index < pages.length; index++) {
      const expected = index === 0 ? 2 : 3;
      expect((await db.selectFrom("monitorChecks").selectAll().where("monitorId", "=", monitors[index]).execute())).toHaveLength(expected);
      expect((await db.selectFrom("metricPoints").selectAll().where("metricId", "=", metrics[index]).execute())).toHaveLength(expected);
      expect((await db.selectFrom("analyticsDaily").selectAll().where("pageId", "=", pages[index]).execute())).toHaveLength(expected);
      expect((await db.selectFrom("notificationLogs").selectAll().where("pageId", "=", pages[index]).execute())).toHaveLength(expected);
      expect((await db.selectFrom("componentStatusEvents").selectAll().where("componentId", "=", components[index]).execute())).toHaveLength(expected + 1);
      const jobs = await db.selectFrom("notificationJobs").select("status").where("pageId", "=", pages[index]).execute();
      expect(jobs).toHaveLength(index === 0 ? 4 : 6);
      expect(jobs.map((job) => job.status)).toContain("PENDING");
      expect(await db.selectFrom("incidents").select("id").where("id", "=", incidents[index]).executeTakeFirst()).toBeDefined();
    }
  });
});

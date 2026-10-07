import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Disposable database only; see tests/integration/postgresql.test.ts. */
const url = process.env.INTEGRATION_DATABASE_URL;
const databaseName = url ? new URL(url).pathname.replace(/^\//, "") : "";
const enabled = Boolean(url) && /test/i.test(databaseName);
if (enabled) process.env.DATABASE_URL = url;

describe.skipIf(!enabled)("monitor check history", () => {
  let client: typeof import("../../lib/postgres/client");
  let checks: typeof import("../../lib/monitor-checks");
  let monitorId = "";

  beforeAll(async () => {
    await (await import("../../lib/migrations")).runMigrations();
    client = await import("../../lib/postgres/client");
    checks = await import("../../lib/monitor-checks");
    const { database } = client;
    const org = await database.insertInto("organizations").values({ name: "Checks", slug: `checks-${Date.now()}` } as never).returning("id").executeTakeFirstOrThrow();
    const page = await database.insertInto("pages").values({ orgId: org.id, name: "Checks", slug: `checks-${Date.now()}`, type: "PUBLIC" } as never).returning("id").executeTakeFirstOrThrow();
    const monitor = await database.insertInto("monitors").values({
      pageId: page.id, name: "m", type: "HTTP", target: "https://example.com", intervalSec: 60, timeoutMs: 1000, downStatus: "MAJOR_OUTAGE",
    } as never).returning("id").executeTakeFirstOrThrow();
    monitorId = monitor.id;
    await checks.ensureMonitorCheckPartitions();
    // 60 checks one minute apart, plus two sharing the newest instant to exercise the id tie-break.
    const newest = new Date();
    await database.insertInto("monitorChecks").values([
      ...Array.from({ length: 60 }, (_, index) => ({ monitorId, checkedAt: new Date(newest.getTime() - (index + 1) * 60_000), ok: index % 5 !== 0 })),
      { monitorId, checkedAt: newest, ok: true },
      { monitorId, checkedAt: newest, ok: false },
    ]).execute();
  }, 60_000);

  afterAll(async () => {
    await client?.postgresPool.end();
  });

  it("walks every check exactly once with keyset pages, newest first", async () => {
    const seen: string[] = [];
    const times: number[] = [];
    let cursor: import("../../lib/monitor-checks").MonitorCheckCursor | null = null;
    let pages = 0;
    do {
      const page = await checks.listMonitorChecks(monitorId, cursor);
      seen.push(...page.checks.map((check) => check.id));
      times.push(...page.checks.map((check) => Date.parse(check.checkedAt)));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen).toHaveLength(62);
    expect(new Set(seen).size).toBe(62);
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("returns the latest N per monitor", async () => {
    const latest = await checks.latestChecksByMonitor([monitorId], 30);
    expect(latest.get(monitorId)).toHaveLength(30);
    const first = await checks.listMonitorChecks(monitorId, null, 30);
    expect(latest.get(monitorId)!.map((check) => check.id)).toEqual(first.checks.map((check) => check.id));
  });

  it("keeps partitions ahead of now and drops only fully expired months", async () => {
    await checks.ensureMonitorCheckPartitions();
    const partitions = async () => (await client.postgresPool.query<{ relname: string }>(
      "select c.relname from pg_inherits i join pg_class c on c.oid = i.inhrelid where i.inhparent = 'monitor_checks'::regclass"
    )).rows.map((row) => row.relname);
    const now = new Date();
    const ahead = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1));
    expect(await partitions()).toContain(`monitor_checks_${ahead.getUTCFullYear()}_${String(ahead.getUTCMonth() + 1).padStart(2, "0")}`);
    // Nothing dropped while the current month is inside the window.
    await checks.dropMonitorCheckPartitionsBefore(new Date(now.getTime() - 40 * 86_400_000));
    expect((await checks.listMonitorChecks(monitorId, null, 100)).checks).toHaveLength(62);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Disposable database only; see tests/integration/postgresql.test.ts. */
const url = process.env.INTEGRATION_DATABASE_URL;
const databaseName = url ? new URL(url).pathname.replace(/^\//, "") : "";
const enabled = Boolean(url) && /test/i.test(databaseName);
if (enabled) process.env.DATABASE_URL = url;

describe.skipIf(!enabled)("metric points and insights", () => {
  let client: typeof import("../../lib/postgres/client");
  let series: typeof import("../../lib/metric-series");
  let points: typeof import("../../lib/metric-points");
  let linkedMetric = "";
  let manualMetric = "";

  beforeAll(async () => {
    await (await import("../../lib/migrations")).runMigrations();
    client = await import("../../lib/postgres/client");
    series = await import("../../lib/metric-series");
    points = await import("../../lib/metric-points");
    const { database } = client;
    const stamp = Date.now();
    const org = await database.insertInto("organizations").values({ name: "Series", slug: `series-${stamp}` } as never).returning("id").executeTakeFirstOrThrow();
    const page = await database.insertInto("pages").values({ orgId: org.id, name: "Series", slug: `series-${stamp}`, type: "PUBLIC" } as never).returning("id").executeTakeFirstOrThrow();
    const metric = async (name: string) => (await database.insertInto("metrics").values({ pageId: page.id, name } as never).returning("id").executeTakeFirstOrThrow()).id;
    linkedMetric = await metric("Linked");
    manualMetric = await metric("Manual");
    const monitor = await database.insertInto("monitors").values({
      pageId: page.id, name: "m", type: "HTTP", target: "https://example.com", intervalSec: 60, timeoutMs: 1000,
      downStatus: "MAJOR_OUTAGE", metricId: linkedMetric,
    } as never).returning("id").executeTakeFirstOrThrow();

    await points.ensureMetricPointPartitions();
    const now = Date.now();
    // 48 hourly points over 2 days (current 24h: values 100..., previous 24h: values 500) for both metrics.
    const rows = [];
    for (let hour = 1; hour <= 48; hour += 1) {
      const value = hour <= 24 ? 100 + hour : 500;
      for (const metricId of [linkedMetric, manualMetric]) rows.push({ metricId, timestamp: new Date(now - hour * 3_600_000 + 60_000), value });
    }
    await database.insertInto("metricPoints").values(rows).execute();
    await database.insertInto("monitorChecks").values([
      ...Array.from({ length: 18 }, (_, i) => ({ monitorId: monitor.id, checkedAt: new Date(now - (i + 1) * 3_000_000), ok: true, statusCode: 200 })),
      { monitorId: monitor.id, checkedAt: new Date(now - 1_000_000), ok: false, statusCode: 404, error: "Expected 200-299, received 404" },
      { monitorId: monitor.id, checkedAt: new Date(now - 2_000_000), ok: false, statusCode: null, error: "connect ECONNREFUSED 10.1.2.3:443" },
    ] as never).execute();
  }, 60_000);

  afterAll(async () => {
    await client?.postgresPool.end();
  });

  it("aggregates the current and previous windows", async () => {
    const insights = (await series.getMetricInsights([linkedMetric, manualMetric], new Date())).get(linkedMetric)!;
    const day = insights["24h"];
    expect(day.summary?.count).toBe(24);
    expect(day.summary?.min).toBe(101);
    expect(day.summary?.max).toBe(124);
    expect(day.previous.summary?.avg).toBe(500);
    expect(day.buckets.length).toBeGreaterThan(0);
    expect(day.buckets.every((bucket) => bucket.min <= bucket.p50 && bucket.p50 <= bucket.p95 && bucket.p95 <= bucket.max)).toBe(true);
    // Histogram: 8 bins up to p99 plus the overflow bin, counting every current point exactly once.
    expect(day.histogram).toHaveLength(9);
    expect(day.histogram.reduce((sum, bin) => sum + bin.count, 0)).toBe(24);
  });

  it("derives uptime and a safe response breakdown only for monitor-linked metrics", async () => {
    const insights = await series.getMetricInsights([linkedMetric, manualMetric], new Date());
    const checks = insights.get(linkedMetric)!["7d"].checks!;
    expect(checks.uptimePct).toBeCloseTo((18 / 20) * 100, 5);
    expect(checks.codes).toEqual([{ code: 200, count: 18 }, { code: 404, count: 1 }]);
    expect(checks.failures).toEqual([{ kind: "refused", count: 1 }]);
    expect(JSON.stringify(checks)).not.toContain("10.1.2.3");
    expect(insights.get(manualMetric)!["7d"].checks).toBeNull();
  });

  it("returns nothing for an empty metric list", async () => {
    expect((await series.getMetricInsights([])).size).toBe(0);
  });

  it("keeps metric_points partitions ahead of now and drops only expired months", async () => {
    await points.ensureMetricPointPartitions();
    const partitions = (await client.postgresPool.query<{ relname: string }>(
      "select c.relname from pg_inherits i join pg_class c on c.oid = i.inhrelid where i.inhparent = 'metric_points'::regclass"
    )).rows.map((row) => row.relname);
    const now = new Date();
    const ahead = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1));
    expect(partitions).toContain(`metric_points_${ahead.getUTCFullYear()}_${String(ahead.getUTCMonth() + 1).padStart(2, "0")}`);
    const before = Number((await client.postgresPool.query("select count(*) from metric_points")).rows[0].count);
    await points.dropMetricPointPartitionsBefore(new Date(now.getTime() - 365 * 86_400_000));
    expect(Number((await client.postgresPool.query("select count(*) from metric_points")).rows[0].count)).toBe(before);
  });
});

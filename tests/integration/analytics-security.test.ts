import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = Boolean(url && /test/i.test(new URL(url).pathname));
if (url && !enabled) throw new Error("Analytics security tests require a disposable database named test");
if (enabled) process.env.DATABASE_URL = url;

describe.skipIf(!enabled)("analytics request budget", () => {
  let db: typeof import("@/lib/postgres/client");
  let post: typeof import("@/app/api/v1/analytics/event/route").POST;
  let bucket: string;
  let pageId: string;
  const slug = `analytics-${randomUUID()}`;
  const request = (pageSlug: string, extraHeaders: Record<string, string> = {}) => new NextRequest("https://status.example/api/v1/analytics/event", {
    method: "POST", headers: { "content-type": "application/json", ...extraHeaders }, body: JSON.stringify({ pageSlug, event: "VIEW" }),
  });
  beforeAll(async () => {
    vi.stubEnv("RATE_LIMIT_ANALYTICS", "20/3600");
    db = await import("@/lib/postgres/client");
    await (await import("@/lib/migrations")).runMigrations();
    post = (await import("@/app/api/v1/analytics/event/route")).POST;
    const { requestIp } = await import("@/lib/rate-limit");
    const { hashSecret } = await import("@/lib/secrets");
    bucket = `analytics:${hashSecret(requestIp(request(slug))).slice(0, 32)}`;
    await db.database.deleteFrom("rateLimits").where("id", "like", "analytics:%").execute();
    const org = await db.database.insertInto("organizations").values({ name: "Analytics test", slug } as never).returning("id").executeTakeFirstOrThrow();
    pageId = (await db.database.insertInto("pages").values({ orgId: org.id, name: "Analytics", slug, type: "PUBLIC", publicVisible: true, analyticsEnabled: true } as never).returning("id").executeTakeFirstOrThrow()).id;
  }, 60_000);
  afterAll(async () => { vi.unstubAllEnvs(); await db?.closeDatabase(); });

  it("counts valid events, limits changing nonexistent slugs, and stops before parsing exhausted requests", async () => {
    expect((await post(request(slug))).status).toBe(200);
    expect((await db.database.selectFrom("analyticsDaily").select("views").where("pageId", "=", pageId).executeTakeFirstOrThrow()).views).toBe(1);
    for (let index = 0; index < 19; index++) {
      expect((await post(request(`missing-${index}-${slug}`))).status).toBe(204);
    }
    const counters = await db.database.selectFrom("rateLimits").select(["id", "count"]).where("id", "like", "analytics:%").execute();
    expect(counters).toEqual([{ id: bucket, count: 20 }]);
    const exhausted = request(slug);
    const readBody = vi.spyOn(exhausted.body!, "getReader");
    expect((await post(exhausted)).status).toBe(204);
    expect(readBody).not.toHaveBeenCalled();
    expect((await db.database.selectFrom("analyticsDaily").select("views").where("pageId", "=", pageId).executeTakeFirstOrThrow()).views).toBe(1);
    await db.database.updateTable("rateLimits").set({ expiresAt: new Date(Date.now() - 1000) }).where("id", "=", bucket).execute();
    expect((await post(request(slug))).status).toBe(200);
    expect((await db.database.selectFrom("analyticsDaily").select("views").where("pageId", "=", pageId).executeTakeFirstOrThrow()).views).toBe(2);
  });
  it("honors Do Not Track without recording or consuming a budget", async () => {
    const before = await db.database.selectFrom("rateLimits").select("count").where("id", "=", bucket).executeTakeFirstOrThrow();
    expect((await post(request(slug, { dnt: "1" }))).status).toBe(204);
    expect(await db.database.selectFrom("rateLimits").select("count").where("id", "=", bucket).executeTakeFirstOrThrow()).toEqual(before);
    expect((await db.database.selectFrom("analyticsDaily").select("views").where("pageId", "=", pageId).executeTakeFirstOrThrow()).views).toBe(2);
  });
});

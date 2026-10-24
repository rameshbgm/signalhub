import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const network = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("@/lib/guarded-fetch", async (original) => {
  const real = await original<typeof import("@/lib/guarded-fetch")>();
  return { ...real, guardedFetch: async (url: string | URL, init: Parameters<typeof real.guardedFetch>[1]) => {
    network.calls.push(String(url));
    if (String(url) === "https://audit.example.test/success") return new Response(null, { status: 204 });
    if (String(url) === "https://audit.example.test/redirect") return new Response(null, { status: 307, headers: { location: "http://127.0.0.1/private" } });
    return real.guardedFetch(url, init);
  } };
});
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = Boolean(url && /test/i.test(new URL(url).pathname));
if (url && !enabled) throw new Error("Server boundary tests require a disposable database named test");
if (enabled) process.env.DATABASE_URL = url;

describe.skipIf(!enabled)("server security boundaries", () => {
  let db: typeof import("@/lib/postgres/client");
  let orgId: string; let otherOrgId: string; let userId: string;
  const pages: string[] = []; const metrics: string[] = [];
  const stamp = randomUUID().slice(0, 8);
  beforeAll(async () => {
    vi.stubEnv("ENCRYPTION_KEY", "synthetic-security-test-encryption-key");
    db = await import("@/lib/postgres/client");
    await (await import("@/lib/migrations")).runMigrations();
    const org = async (name: string) => (await db.database.insertInto("organizations").values({ name, slug: `${name}-${stamp}` } as never).returning("id").executeTakeFirstOrThrow()).id;
    orgId = await org("boundary"); otherOrgId = await org("foreign");
    userId = (await db.database.insertInto("users").values({ username: `boundary-${stamp}`, canonicalUsername: `boundary-${stamp}`, email: `${stamp}@example.test`, canonicalEmail: `${stamp}@example.test`, name: "Test" } as never).returning("id").executeTakeFirstOrThrow()).id;
    for (const [index, id] of [orgId, orgId, otherOrgId].entries()) {
      const page = await db.database.insertInto("pages").values({ orgId: id, name: `page-${index}`, slug: `page-${index}-${stamp}`, type: "PUBLIC", publicVisible: true } as never).returning("id").executeTakeFirstOrThrow();
      pages.push(page.id);
      const metric = await db.database.insertInto("metrics").values({ pageId: page.id, name: "Latency", suffix: "ms" } as never).returning("id").executeTakeFirstOrThrow();
      metrics.push(metric.id);
    }
  }, 60_000);
  afterAll(async () => { vi.unstubAllEnvs(); await db?.closeDatabase(); });

  it("enforces API scopes, page ownership, expiration and revocation while allowing valid metrics", async () => {
    const { hashSecret } = await import("@/lib/secrets");
    const { POST } = await import("@/app/api/v1/manage/metrics/[id]/points/route");
    const token = `test-${randomUUID()}`;
    const key = await db.database.insertInto("apiKeys").values({ orgId, name: "Test", keyHash: hashSecret(token), prefix: "test", lastFour: "test", createdBy: userId, scopes: ["metrics.write"], pageIds: [pages[0]], allowedCidrs: [], expiresAt: null, revokedAt: null, lastUsedAt: null }).returning("id").executeTakeFirstOrThrow();
    const send = (id: string, credential = token, body: unknown = { value: 12 }) => POST(new NextRequest(`https://status.example/api/v1/manage/metrics/${id}/points`, { method: "POST", headers: { authorization: `Bearer ${credential}` }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
    expect((await send(metrics[0], "wrong")).status).toBe(401);
    expect((await send(metrics[0])).status).toBe(201);
    expect((await send(metrics[1])).status).toBe(404);
    expect((await send(metrics[2])).status).toBe(404);
    expect((await send(metrics[0], token, { value: "NaN" })).status).toBe(400);
    await db.database.updateTable("apiKeys").set({ scopes: ["metrics.read"] }).where("id", "=", key.id).execute();
    expect((await send(metrics[0])).status).toBe(401);
    await db.database.updateTable("apiKeys").set({ scopes: ["metrics.write"], expiresAt: new Date(Date.now() - 1000) }).where("id", "=", key.id).execute();
    expect((await send(metrics[0])).status).toBe(401);
    await db.database.updateTable("apiKeys").set({ expiresAt: null, revokedAt: new Date() }).where("id", "=", key.id).execute();
    expect((await send(metrics[0])).status).toBe(401);
    expect(await db.database.selectFrom("metricPoints").select("id").where("metricId", "in", metrics).execute()).toHaveLength(1);
  });

  it("bounds heartbeat writes per monitor and rejects invalid tokens without changing state", async () => {
    const { hashSecret } = await import("@/lib/secrets");
    const token = `beat-${randomUUID()}`;
    const monitor = await db.database.insertInto("monitors").values({ pageId: pages[0], name: "Heartbeat", type: "HEARTBEAT", target: "", intervalSec: 60, timeoutMs: 1000, downStatus: "MAJOR_OUTAGE", heartbeatTokenHash: hashSecret(token), authType: "NONE" } as never).returning("id").executeTakeFirstOrThrow();
    vi.stubEnv("RATE_LIMIT_HEARTBEAT_MONITOR", "10/60");
    const { GET, POST } = await import("@/app/api/v1/heartbeat/[token]/route");
    const call = (credential: string, method: "GET" | "POST" = "GET") => (method === "GET" ? GET : POST)(new Request(`https://status.example/api/v1/heartbeat/${credential}`, { method }), { params: Promise.resolve({ token: credential }) });
    expect((await call("wrong")).status).toBe(404);
    for (let index = 0; index < 10; index++) expect((await call(token, index % 2 ? "GET" : "POST")).status).toBe(200);
    const before = await db.database.selectFrom("monitors").select("lastHeartbeatAt").where("id", "=", monitor.id).executeTakeFirstOrThrow();
    const denied = await call(token);
    expect(denied.status).toBe(429); expect(Number(denied.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await db.database.selectFrom("monitors").select("lastHeartbeatAt").where("id", "=", monitor.id).executeTakeFirstOrThrow()).toEqual(before);
  });

  it("uses one public-status IP counter across arbitrary page names", async () => {
    const { consumeNamedLimit } = await import("@/lib/rate-limit");
    const ip = `test-address-${stamp}`;
    for (const slug of ["missing-a", "missing-b", "missing-c"]) await consumeNamedLimit("public-status", ip, slug);
    const { hashSecret } = await import("@/lib/secrets");
    const counters = await db.database.selectFrom("rateLimits").select(["id", "count"]).where("id", "like", `%${hashSecret(ip).slice(0, 32)}`).execute();
    expect(counters).toEqual([{ id: `public-status:${hashSecret(ip).slice(0, 32)}`, count: 3 }]);
  });

  it("delivers valid audit jobs and refuses private destinations and redirects", async () => {
    const { encryptSecret } = await import("@/lib/encryption");
    const { drainAuditDeliveryJobs } = await import("@/worker/audit-delivery");
    // Other integration suites may leave synthetic jobs; isolate this worker's queue.
    await db.database.updateTable("auditDeliveryJobs").set({ nextAttemptAt: new Date("2099-01-01") }).execute();
    const rows: string[] = [];
    for (const target of ["https://audit.example.test/success", "https://127.0.0.1/private", "https://audit.example.test/redirect"]) {
      const sink = await db.database.insertInto("auditSinks").values({ orgId, name: "Boundary", url: target, secretCiphertext: encryptSecret("synthetic-signing-secret-123456789"), createdBy: userId }).returning("id").executeTakeFirstOrThrow();
      const job = await db.database.insertInto("auditDeliveryJobs").values({ sinkId: sink.id, deduplicationKey: randomUUID(), payload: { event: "synthetic" }, status: "PENDING", maxAttempts: 1, nextAttemptAt: new Date(), leaseOwner: null, leaseExpiresAt: null, lastError: null, responseStatus: null, sentAt: null }).returning("id").executeTakeFirstOrThrow();
      rows.push(job.id);
    }
    network.calls = [];
    expect(await drainAuditDeliveryJobs(`test-${stamp}`, 3)).toBe(3);
    const result = await db.database.selectFrom("auditDeliveryJobs").select(["id", "status", "lastError"]).where("id", "in", rows).execute();
    expect(result.find(row => row.id === rows[0])?.status).toBe("SENT");
    expect(result.find(row => row.id === rows[1])).toMatchObject({ status: "DEAD_LETTER", lastError: expect.stringMatching(/Private or local/) });
    expect(result.find(row => row.id === rows[2])).toMatchObject({ status: "DEAD_LETTER", lastError: expect.stringMatching(/307/) });
    expect(network.calls).not.toContain("http://127.0.0.1/private");
  });
});

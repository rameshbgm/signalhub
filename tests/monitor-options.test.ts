import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgresql://signalhub:signalhub@127.0.0.1:5432/status_unit_tests";

const { applyUpsideDown, runCheck, withCacheBuster } = await import("../worker/checks");
const { readResponsePreview } = await import("../lib/limited-response");

describe("withCacheBuster", () => {
  it("adds a random _sh parameter without touching the rest of the URL", () => {
    const original = new URL("https://example.com/health?a=1#frag");
    const busted = withCacheBuster(original, "token");
    expect(busted.searchParams.get("a")).toBe("1");
    expect(busted.searchParams.get("_sh")).toBe("token");
    expect(busted.hash).toBe("#frag");
    expect(original.searchParams.has("_sh")).toBe(false);
  });

  it("generates a fresh token per call", () => {
    const url = new URL("https://example.com/");
    expect(withCacheBuster(url).search).not.toBe(withCacheBuster(url).search);
  });
});

describe("applyUpsideDown", () => {
  const up = { ok: true, latencyMs: 12, statusCode: 200, error: null };
  const down = { ok: false, latencyMs: 5, statusCode: null, error: "ECONNREFUSED" };

  it("leaves results alone unless the monitor opted in", () => {
    expect(applyUpsideDown(up, { upsideDown: false, type: "HTTP" })).toBe(up);
  });

  it("turns a reachable service into a failure and an unreachable one into success", () => {
    expect(applyUpsideDown(up, { upsideDown: true, type: "HTTP" })).toMatchObject({ ok: false, statusCode: 200, error: "Service is reachable (upside-down mode)" });
    expect(applyUpsideDown(down, { upsideDown: true, type: "TCP" })).toMatchObject({ ok: true, error: null, latencyMs: 5 });
  });

  it("never flips heartbeat monitors", () => {
    expect(applyUpsideDown(down, { upsideDown: true, type: "HEARTBEAT" })).toBe(down);
  });
});

describe("readResponsePreview", () => {
  it("returns at most the requested bytes and drops NUL characters", async () => {
    expect(await readResponsePreview(new Response("a".repeat(10_000)))).toHaveLength(4096);
    expect(await readResponsePreview(new Response("short"), 100)).toBe("short");
    expect(await readResponsePreview(new Response("he\0llo"))).toBe("hello");
    expect(await readResponsePreview(new Response(null))).toBe("");
  });
});

describe("saved error response", () => {
  let server: http.Server;
  let url = "";
  beforeAll(async () => {
    server = http.createServer((request, response) => {
      response.writeHead(request.url === "/ok" ? 200 : 503).end(request.url === "/big" ? "x".repeat(20_000) : `{"error":"db down"}`);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.MONITOR_ALLOW_PRIVATE_TARGETS = "true";
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const monitor = (overrides: Record<string, unknown>) => ({
    id: "m", type: "HTTP", method: "GET", requestHeaders: "{}", requestBody: null, expectedStatusRange: "200-299",
    keywordMatch: null, keywordAbsent: null, authType: "NONE", authSecret: null, authConfigCiphertext: null,
    timeoutMs: 5000, verifyTls: true, cacheBuster: false, ipFamily: "AUTO", saveErrorResponse: false, ...overrides,
  }) as never;

  it("keeps the start of a failing response only when the monitor opted in", async () => {
    const saved = await runCheck(monitor({ target: `${url}/fail`, saveErrorResponse: true }));
    expect(saved).toMatchObject({ ok: false, statusCode: 503, response: '{"error":"db down"}' });
    const notSaved = await runCheck(monitor({ target: `${url}/fail` }));
    expect(notSaved.ok).toBe(false);
    expect(notSaved.response ?? null).toBeNull();
  });

  it("truncates large bodies and ignores healthy responses", async () => {
    const big = await runCheck(monitor({ target: `${url}/big`, saveErrorResponse: true }));
    expect(big.response).toHaveLength(4096);
    const ok = await runCheck(monitor({ target: `${url}/ok`, saveErrorResponse: true }));
    expect(ok.ok).toBe(true);
    expect(ok.response ?? null).toBeNull();
  });

  it("saves the body of a keyword failure", async () => {
    const result = await runCheck(monitor({ type: "KEYWORD", target: `${url}/ok`, keywordMatch: "never-there", saveErrorResponse: true }));
    expect(result).toMatchObject({ ok: false, error: "Required keyword was not found", response: `{"error":"db down"}` });
  });
});

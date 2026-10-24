import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prepareMonitorInput, type MonitorInput } from "@/lib/domain/monitors";
import { encryptSecret } from "@/lib/encryption";
import { runMonitorTest } from "@/lib/monitor-test";

// Tests must use the check engine without persisting any monitor or service data.
vi.mock("@/lib/postgres/client", () => ({
  database: new Proxy({}, { get: () => { throw new Error("A monitor test must not access the database"); } }),
}));

describe("unsaved monitor tests", () => {
  let server: http.Server;
  let target: string;
  let requests = 0;

  function input(overrides: Partial<MonitorInput> = {}) {
    return prepareMonitorInput({
      name: "Test monitor", type: "HTTP", target, componentId: null, port: null,
      method: "GET", requestBody: null, requestHeaders: "{}", expectedStatusRange: "200-299",
      keywordMatch: null, keywordAbsent: null, sslWarnDays: null, authType: "NONE",
      authConfig: null, authUsername: null, authSecret: null, authHeaderName: null,
      verifyTls: true, intervalSec: 60, timeoutMs: 500, failThreshold: 1, recoverThreshold: 1,
      downStatus: "MAJOR_OUTAGE", actionFlipStatus: true, actionRecordMetric: true,
      actionAutoIncident: true, actionNotify: true, ...overrides,
    });
  }

  beforeAll(async () => {
    vi.stubEnv("MONITOR_ALLOW_PRIVATE_TARGETS", "true");
    vi.stubEnv("ENCRYPTION_KEY", "synthetic-monitor-test-key");
    server = http.createServer((request, response) => {
      requests++;
      if (request.url === "/slow") return;
      if (request.url === "/failure") { response.writeHead(503).end("private response body"); return; }
      if (request.url === "/auth") {
        response.writeHead(request.headers.authorization === "Bearer synthetic-secret" ? 200 : 401).end();
        return;
      }
      if (request.url === "/redirect") { response.writeHead(302, { location: target }).end(); return; }
      response.end("service healthy");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    target = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    vi.unstubAllEnvs();
  });

  it("runs a real request and returns status and latency without saving anything", async () => {
    const result = await runMonitorTest(await input());
    expect(result).toMatchObject({ ok: true, message: "Test passed", statusCode: 200 });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(Object.keys(result).sort()).toEqual(["latencyMs", "message", "ok", "statusCode"]);
  });

  it("reports unexpected status codes without returning the response body", async () => {
    const result = await runMonitorTest(await input({ target: `${target}/failure`, saveErrorResponse: true }));
    expect(result).toMatchObject({ ok: false, statusCode: 503, message: "Expected 200-299, received 503" });
    expect(JSON.stringify(result)).not.toContain("private response body");
  });

  it("uses unsaved expectations, keywords and upside-down settings", async () => {
    expect(await runMonitorTest(await input({ target: `${target}/failure`, expectedStatusRange: "503-503" }))).toMatchObject({ ok: true, statusCode: 503 });
    expect(await runMonitorTest(await input({ keywordMatch: "missing text" }))).toMatchObject({ ok: false, message: "Required keyword was not found" });
    expect(await runMonitorTest(await input({ upsideDown: true }))).toMatchObject({ ok: false, message: "Service is reachable (upside-down mode)" });
  });

  it("uses a supplied secret or keeps the saved secret on edit without exposing it", async () => {
    const draft = await input({ target: `${target}/auth`, authType: "BEARER", authSecret: "synthetic-secret" });
    expect(await runMonitorTest(draft)).toMatchObject({ ok: true });
    const saved = { authType: "BEARER", authSecret: encryptSecret("synthetic-secret"), authConfigCiphertext: null };
    const result = await runMonitorTest(await input({ target: `${target}/auth`, authType: "BEARER" }), { saved });
    expect(result).toMatchObject({ ok: true });
    expect(JSON.stringify(result)).not.toContain("synthetic-secret");
    expect(await runMonitorTest(await input({ target: `${target}/auth`, authType: "BEARER", authSecret: "different" }), { saved })).toMatchObject({ ok: false, statusCode: 401 });
  });

  it("honors the timeout and follows guarded redirects", async () => {
    expect(await runMonitorTest(await input({ target: `${target}/slow`, timeoutMs: 100 }))).toMatchObject({ ok: false, message: "Request timed out after 100 ms" });
    expect(await runMonitorTest(await input({ target: `${target}/redirect` }))).toMatchObject({ ok: true, statusCode: 200 });
  });

  it("requires a real heartbeat instead of reporting a synthetic success", async () => {
    const before = requests;
    await expect(runMonitorTest(await input({ type: "HEARTBEAT", target: "inbound-heartbeat" }))).rejects.toThrow("send a ping to its heartbeat URL");
    expect(requests).toBe(before);
  });

  it("applies the existing private-target policy before running a test", async () => {
    vi.stubEnv("MONITOR_ALLOW_PRIVATE_TARGETS", "false");
    try { await expect(input()).rejects.toThrow(/private|public|loopback|blocked|not allowed/i); }
    finally { vi.stubEnv("MONITOR_ALLOW_PRIVATE_TARGETS", "true"); }
  });
});

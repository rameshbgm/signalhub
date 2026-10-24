import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgresql://signalhub:signalhub@127.0.0.1:5432/status_unit_tests";
process.env.MONITOR_ALLOW_PRIVATE_TARGETS = "true";

const { prepareMonitorInput } = await import("../lib/domain/monitors");

const input = (overrides: Record<string, unknown> = {}) => ({
  name: "m", type: "HTTP", componentId: null, target: "http://127.0.0.1:1/", port: null, method: "GET", requestBody: null,
  requestHeaders: "", expectedStatusRange: "200-299", keywordMatch: null, keywordAbsent: null, sslWarnDays: null,
  authType: "NONE", authUsername: null, authSecret: null, authHeaderName: null, verifyTls: true, intervalSec: 60, timeoutMs: 5000,
  failThreshold: 1, recoverThreshold: 1, downStatus: "MAJOR_OUTAGE", actionFlipStatus: true, actionRecordMetric: false,
  actionAutoIncident: false, actionNotify: false, ...overrides,
}) as never;

describe("prepareMonitorInput request headers", () => {
  it("accepts a JSON object or nothing", async () => {
    await expect(prepareMonitorInput(input({ requestHeaders: '{"X-Api-Key":"abc"}' }))).resolves.toBeDefined();
    await expect(prepareMonitorInput(input({ requestHeaders: "" }))).resolves.toBeDefined();
  });

  it("explains invalid JSON in words an operator can act on, as a plain Error the form can show", async () => {
    const error = await prepareMonitorInput(input({ requestHeaders: "not json" })).catch((caught: Error) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("Error");
    expect((error as Error).message).toMatch(/valid JSON/);
    await expect(prepareMonitorInput(input({ requestHeaders: "[1,2]" }))).rejects.toThrow("Request headers must be a JSON object");
  });
});

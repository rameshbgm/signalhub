import { describe, expect, it } from "vitest";
import { parseCidrs } from "../lib/proxy-trust";
import { SETTINGS, parseEnvValue, parseValue, settingDefinition } from "../lib/settings/registry";
import { effectiveSetting } from "../lib/settings/effective";

const def = (key: Parameters<typeof settingDefinition>[0]) => settingDefinition(key);

describe("registry", () => {
  it("has unique keys and defaults that satisfy their own rules", () => {
    expect(new Set(SETTINGS.map((item) => item.key)).size).toBe(SETTINGS.length);
    for (const item of SETTINGS) expect(parseValue(item, item.default), item.key).toMatchObject({ ok: true });
  });

  it("keeps today's behaviour as the defaults", () => {
    const value = (key: Parameters<typeof settingDefinition>[0]) => def(key).default;
    expect(value("sessionIdleSeconds")).toBe(8 * 60 * 60);
    expect(value("sessionAbsoluteSeconds")).toBe(7 * 24 * 60 * 60);
    expect(value("passwordMinLength")).toBe(14);
    expect(value("monitorAllowPrivateTargets")).toBe(false);
    expect(value("monitorEnableIcmp")).toBe(false);
    expect(value("monitorMaxResponseBytes")).toBe(1_048_576);
    expect(value("publicUrl")).toBeNull();
    expect(value("adminCidrs")).toEqual([]);
    // Worker tuning keeps the numbers that were read from WORKER_* with these fallbacks.
    expect([
      value("workerMonitorSweepMs"), value("workerMonitorConcurrency"), value("workerNotificationSweepMs"), value("workerNotificationBatch"),
      value("workerExportSweepMs"), value("workerAuditDeliverySweepMs"), value("workerAuditDeliveryBatch"),
      value("workerPlatformJobSweepMs"), value("workerPlatformJobBatch"), value("workerMaintenanceSweepMs"),
    ]).toEqual([1000, 20, 1000, 25, 5000, 2000, 25, 5000, 1, 10000]);
  });
});

describe("parseValue", () => {
  it("normalises a public URL and rejects anything that is not a plain http(s) base", () => {
    expect(parseValue(def("publicUrl"), "https://Status.Example.com/")).toEqual({ ok: true, value: "https://status.example.com" });
    expect(parseValue(def("publicUrl"), "https://example.com/status/")).toEqual({ ok: true, value: "https://example.com/status" });
    expect(parseValue(def("publicUrl"), "")).toEqual({ ok: true, value: null });
    expect(parseValue(def("publicUrl"), null)).toEqual({ ok: true, value: null });
    for (const bad of ["javascript:alert(1)", "ftp://x.test", "https://user:pw@x.test", "https://x.test/?q=1", "https://x.test/#a", "not a url", 5]) {
      expect(parseValue(def("publicUrl"), bad).ok, String(bad)).toBe(false);
    }
  });

  it("enforces integer ranges and enum options", () => {
    expect(parseValue(def("sessionIdleSeconds"), 3600)).toEqual({ ok: true, value: 3600 });
    expect(parseValue(def("sessionIdleSeconds"), 60).ok).toBe(false);
    expect(parseValue(def("sessionIdleSeconds"), 1.5).ok).toBe(false);
    expect(parseValue(def("passwordMinLength"), 11).ok).toBe(false);
    expect(parseValue(def("hsts"), "on")).toEqual({ ok: true, value: "on" });
    expect(parseValue(def("hsts"), "maybe").ok).toBe(false);
    expect(parseValue(def("secureCookies"), "never").ok).toBe(false);
  });

  it("validates network ranges", () => {
    expect(parseValue(def("adminCidrs"), ["10.0.0.0/8", "fd00::/8"])).toEqual({ ok: true, value: ["10.0.0.0/8", "fd00::/8"] });
    expect(parseValue(def("adminCidrs"), ["nope"]).ok).toBe(false);
    expect(parseValue(def("adminCidrs"), "10.0.0.0/8").ok).toBe(false);
    expect(parseCidrs("10.0.0.0/8").invalid).toEqual([]);
  });
});

describe("parseEnvValue", () => {
  it("reads strings the way the old variables were read, clamping numbers", () => {
    expect(parseEnvValue(def("sessionIdleSeconds"), "10")).toEqual({ ok: true, value: 15 * 60 });
    expect(parseEnvValue(def("sessionIdleSeconds"), "999999999")).toEqual({ ok: true, value: 30 * 24 * 60 * 60 });
    expect(parseEnvValue(def("sessionIdleSeconds"), "abc").ok).toBe(false);
    expect(parseEnvValue(def("monitorAllowPrivateTargets"), "true")).toEqual({ ok: true, value: true });
    expect(parseEnvValue(def("monitorAllowPrivateTargets"), "false")).toEqual({ ok: true, value: false });
    expect(parseEnvValue(def("monitorAllowPrivateTargets"), "yes").ok).toBe(false);
    expect(parseEnvValue(def("publicUrl"), "https://status.example.com/")).toEqual({ ok: true, value: "https://status.example.com" });
    expect(parseEnvValue(def("adminCidrs"), "10.0.0.0/8, 192.168.1.5")).toEqual({ ok: true, value: ["10.0.0.0/8", "192.168.1.5/32"] });
    expect(parseEnvValue(def("adminCidrs"), "10.0.0.0/8, nope").ok).toBe(false);
  });
});

describe("effectiveSetting", () => {
  it("resolves environment, then admin, then default, and says which", () => {
    const stored = { sessionIdleSeconds: 7200, passwordMinLength: 16 };
    expect(effectiveSetting("sessionIdleSeconds", { TENANT_SESSION_IDLE_SECONDS: "3600" }, stored)).toMatchObject({ value: 3600, source: "environment" });
    expect(effectiveSetting("sessionIdleSeconds", {}, stored)).toMatchObject({ value: 7200, source: "admin" });
    expect(effectiveSetting("sessionAbsoluteSeconds", {}, stored)).toMatchObject({ value: 604800, source: "default" });
  });

  it("treats a blank environment variable as unset", () => {
    expect(effectiveSetting("passwordMinLength", { PASSWORD_MIN_LENGTH: "" }, { passwordMinLength: 20 })).toMatchObject({ value: 20, source: "admin" });
  });

  it("falls back to the default, with a notice, when a stored value is invalid (never throws)", () => {
    const result = effectiveSetting("sessionIdleSeconds", {}, { sessionIdleSeconds: "soon" });
    expect(result).toMatchObject({ value: 8 * 60 * 60, source: "default" });
    expect(result.invalid).toMatch(/ignored/i);
    expect(effectiveSetting("adminCidrs", {}, { adminCidrs: ["bad"] })).toMatchObject({ value: [], source: "default" });
    expect(effectiveSetting("publicUrl", {}, { publicUrl: "javascript:1" })).toMatchObject({ value: null, source: "default" });
  });

  it("ignores an invalid environment value and reports it", () => {
    const result = effectiveSetting("monitorAllowPrivateTargets", { MONITOR_ALLOW_PRIVATE_TARGETS: "yes" }, { monitorAllowPrivateTargets: true });
    expect(result).toMatchObject({ value: true, source: "admin" });
    expect(result.invalid).toMatch(/MONITOR_ALLOW_PRIVATE_TARGETS/);
  });

  it("keeps a malformed admin-network variable fail-closed: bad entries match nothing instead of lifting the restriction", () => {
    const result = effectiveSetting("adminCidrs", { PLATFORM_ADMIN_ALLOWED_CIDRS: "10.0.0.0/8, oops" }, {});
    expect(result).toMatchObject({ source: "environment", value: ["10.0.0.0/8", "oops"] });
    expect(result.invalid).toMatch(/oops/);
    expect(effectiveSetting("adminCidrs", { PLATFORM_ADMIN_ALLOWED_CIDRS: "10.0.0.0/8" }, {}).invalid).toBeUndefined();
  });

  it("safe mode uses defaults and the environment only", () => {
    const env = { SIGNALHUB_SAFE_MODE: "true", PASSWORD_MIN_LENGTH: "20" };
    expect(effectiveSetting("sessionIdleSeconds", env, { sessionIdleSeconds: 7200 })).toMatchObject({ value: 28800, source: "default" });
    expect(effectiveSetting("passwordMinLength", env, { passwordMinLength: 30 })).toMatchObject({ value: 20, source: "environment" });
  });
});

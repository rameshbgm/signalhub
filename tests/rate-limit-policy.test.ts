import { describe, expect, it } from "vitest";
import { LIMITERS, limiterEnvName, parseRateLimits, presetRateLimits, resolveLimit, type LimiterId } from "../lib/rate-limit-policy";

// The numbers that were hard-coded at the call sites before the catalogue existed.
const ORIGINAL: Record<string, [limit: number, windowMs: number]> = {
  "page-access": [10, 15 * 60_000],
  "public-status": [300, 60_000],
  "public-metric-window": [120, 60_000],
  automation: [120, 60_000],
  "heartbeat-ip": [1200, 60_000],
  "heartbeat-monitor": [120, 60_000],
  "otp-verify": [30, 15 * 60_000],
  "subscription-ip": [10, 60 * 60_000],
  "subscription-contact": [5, 60 * 60_000],
  analytics: [120, 60 * 60_000],
  "oidc-start": [20, 15 * 60_000],
  "enterprise-oidc-start": [20, 15 * 60_000],
  "identity-connection-discovery": [60, 15 * 60_000],
  "password-reset-ip": [10, 15 * 60_000],
  "password-reset-account": [3, 60 * 60_000],
  "password-reset-submit": [10, 15 * 60_000],
  "accept-invite-ip": [20, 15 * 60_000],
  "accept-invite-token": [8, 15 * 60_000],
  "login-ip": [20, 15 * 60_000],
  "login-account": [8, 15 * 60_000],
  "saml-start": [20, 15 * 60_000],
  // New with MFA, so nothing was hard-coded before.
  "mfa-ip": [30, 15 * 60_000],
  "mfa-account": [15, 15 * 60_000],
  "mfa-request-ip": [5, 60 * 60_000],
  "mfa-request-account": [3, 60 * 60_000],
  // Interactive monitor setup tests.
  "monitor-test-account": [10, 60_000],
};

describe("catalogue", () => {
  it("defaults equal the literals it replaces, so an upgrade changes nothing", () => {
    expect(LIMITERS.map((limiter) => limiter.id).sort()).toEqual(Object.keys(ORIGINAL).sort());
    for (const limiter of LIMITERS) {
      expect([limiter.limit, limiter.windowSeconds * 1000], limiter.id).toEqual(ORIGINAL[limiter.id]);
      expect(resolveLimit(limiter.id as LimiterId, {}, {})).toMatchObject({ limit: ORIGINAL[limiter.id][0], windowMs: ORIGINAL[limiter.id][1], source: "default" });
    }
  });

  it("keeps every default inside its own bounds, and never lets a limit reach zero", () => {
    for (const limiter of LIMITERS) {
      expect(limiter.limit, limiter.id).toBeGreaterThanOrEqual(limiter.minLimit);
      expect(limiter.limit, limiter.id).toBeLessThanOrEqual(limiter.maxLimit);
      expect(limiter.minLimit, limiter.id).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("resolveLimit", () => {
  it("resolves environment, then admin value, then default", () => {
    const stored = { rateLimits: { "login-ip": { limit: 40, windowSeconds: 600 } } };
    expect(resolveLimit("login-ip", {}, stored)).toMatchObject({ limit: 40, windowMs: 600_000, source: "admin" });
    expect(resolveLimit("login-ip", { RATE_LIMIT_LOGIN_IP: "50/300" }, stored)).toMatchObject({ limit: 50, windowMs: 300_000, source: "environment" });
    expect(resolveLimit("login-account", {}, stored)).toMatchObject({ limit: 8, source: "default" });
  });

  it("names the environment variable from the id", () => {
    expect(limiterEnvName("password-reset-ip")).toBe("RATE_LIMIT_PASSWORD_RESET_IP");
  });

  it("clamps environment values to the allowed range and ignores unreadable ones, never throwing", () => {
    expect(resolveLimit("login-account", { RATE_LIMIT_LOGIN_ACCOUNT: "1/900" }, {}).limit).toBe(3);
    expect(resolveLimit("login-account", { RATE_LIMIT_LOGIN_ACCOUNT: "9999/900" }, {}).limit).toBe(50);
    expect(resolveLimit("login-account", { RATE_LIMIT_LOGIN_ACCOUNT: "soon" }, {})).toMatchObject({ limit: 8, source: "default" });
    expect(resolveLimit("login-account", { RATE_LIMIT_LOGIN_ACCOUNT: "" }, {})).toMatchObject({ source: "default" });
  });

  it("ignores a corrupt saved value for that limiter only", () => {
    const stored = { rateLimits: { "login-ip": { limit: -5, windowSeconds: 600 }, "login-account": { limit: 6, windowSeconds: 900 } } };
    expect(resolveLimit("login-ip", {}, stored)).toMatchObject({ limit: 20, source: "default" });
    expect(resolveLimit("login-account", {}, stored)).toMatchObject({ limit: 6, source: "admin" });
    expect(resolveLimit("login-ip", {}, { rateLimits: "garbage" })).toMatchObject({ source: "default" });
  });

  it("safe mode ignores saved values", () => {
    expect(resolveLimit("login-ip", { SIGNALHUB_SAFE_MODE: "true" }, { rateLimits: { "login-ip": { limit: 99, windowSeconds: 60 } } })).toMatchObject({ limit: 20, source: "default" });
  });
});

describe("parseRateLimits", () => {
  it("accepts in-range values and reports each problem", () => {
    expect(parseRateLimits({ "login-ip": { limit: 30, windowSeconds: 900 } })).toEqual({ ok: true, value: { "login-ip": { limit: 30, windowSeconds: 900 } } });
    const bad = parseRateLimits({ "login-account": { limit: 2, windowSeconds: 900 }, "nope": { limit: 1, windowSeconds: 60 }, "login-ip": { limit: 30, windowSeconds: 1 } });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.join(" ")).toMatch(/login-account[\s\S]*3[\s\S]*50/);
    if (!bad.ok) expect(bad.errors.join(" ")).toMatch(/nope/);
    if (!bad.ok) expect(bad.errors.join(" ")).toMatch(/login-ip[\s\S]*window/i);
  });
});

describe("presets", () => {
  it("Standard clears every override", () => {
    expect(presetRateLimits("standard")).toEqual({});
  });

  it("Relaxed raises, and Strict lowers, only the per-address limits, within bounds", () => {
    const relaxed = presetRateLimits("relaxed");
    const strict = presetRateLimits("strict");
    for (const limiter of LIMITERS) {
      if (limiter.scope !== "ip") {
        expect(relaxed[limiter.id], limiter.id).toBeUndefined();
        expect(strict[limiter.id], limiter.id).toBeUndefined();
      } else {
        expect(relaxed[limiter.id]!.limit, limiter.id).toBeGreaterThanOrEqual(limiter.limit);
        expect(relaxed[limiter.id]!.limit, limiter.id).toBeLessThanOrEqual(limiter.maxLimit);
        expect(strict[limiter.id]!.limit, limiter.id).toBeLessThanOrEqual(limiter.limit);
        expect(strict[limiter.id]!.limit, limiter.id).toBeGreaterThanOrEqual(limiter.minLimit);
      }
    }
    expect(relaxed["login-ip"]!.limit).toBe(100);
    expect(strict["login-ip"]!.limit).toBe(10);
  });
});

import { describe, expect, it } from "vitest";

process.env.ENCRYPTION_KEY = "heartbeat-auth-test-key";

const { encryptSecret } = await import("../lib/encryption");
const { heartbeatAuthorized, heartbeatChallenge } = await import("../lib/heartbeat-auth");

const basic = (user: string, password: string) => `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
const monitor = (authType: string, username: string | null, secret: string | null) => ({ authType, authUsername: username, authSecret: secret ? encryptSecret(secret) : null });

describe("heartbeatAuthorized", () => {
  it("lets any call through when the monitor requires no credentials", () => {
    expect(heartbeatAuthorized(monitor("NONE", null, null), null)).toBe(true);
    expect(heartbeatChallenge({ authType: "NONE" })).toBeNull();
  });

  it("requires the exact username and password for Basic", () => {
    const m = monitor("BASIC", "cron", "s3cret:with:colons");
    expect(heartbeatAuthorized(m, basic("cron", "s3cret:with:colons"))).toBe(true);
    expect(heartbeatAuthorized(m, basic("cron", "wrong"))).toBe(false);
    expect(heartbeatAuthorized(m, basic("other", "s3cret:with:colons"))).toBe(false);
    expect(heartbeatAuthorized(m, null)).toBe(false);
    expect(heartbeatAuthorized(m, "Bearer s3cret:with:colons")).toBe(false);
    expect(heartbeatAuthorized(m, "Basic not-base64-colon")).toBe(false);
    expect(heartbeatChallenge(m)).toMatch(/^Basic /);
  });

  it("requires the exact token for Bearer", () => {
    const m = monitor("BEARER", null, "tok-123");
    expect(heartbeatAuthorized(m, "Bearer tok-123")).toBe(true);
    expect(heartbeatAuthorized(m, "bearer tok-123")).toBe(true);
    expect(heartbeatAuthorized(m, "Bearer tok-124")).toBe(false);
    expect(heartbeatAuthorized(m, basic("x", "tok-123"))).toBe(false);
    expect(heartbeatChallenge(m)).toMatch(/^Bearer /);
  });

  it("refuses when credentials are required but none are stored", () => {
    expect(heartbeatAuthorized(monitor("BASIC", "cron", null), basic("cron", ""))).toBe(false);
  });
});

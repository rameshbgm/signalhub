import { describe, expect, it } from "vitest";
import { appBaseUrl, hstsValue, requestScheme, secureCookieDecision } from "../lib/settings/request";

const PEER = "x-signalhub-peer";
const headers = (values: Record<string, string>) => new Headers(values);
const auto = { mode: "auto", hops: 1, cidrs: [] } as const;

describe("appBaseUrl", () => {
  it("prefers the environment, then the admin value, then the request origin, without a trailing slash", () => {
    expect(appBaseUrl("http://req.test", { NEXT_PUBLIC_APP_URL: "https://env.example.com/" }, { publicUrl: "https://admin.example.com" })).toBe("https://env.example.com");
    expect(appBaseUrl("http://req.test", {}, { publicUrl: "https://admin.example.com/" })).toBe("https://admin.example.com");
    expect(appBaseUrl("http://req.test/", {}, {})).toBe("http://req.test");
    expect(appBaseUrl(undefined, {}, {})).toBe("");
  });

  it("ignores an invalid saved address instead of building links from it", () => {
    expect(appBaseUrl("http://req.test", {}, { publicUrl: "javascript:alert(1)" })).toBe("http://req.test");
  });
});

describe("requestScheme", () => {
  it("is unknown when the connection address is not visible", () => {
    expect(requestScheme(headers({ "x-forwarded-proto": "https" }), false, auto)).toBeNull();
  });

  it("believes X-Forwarded-Proto only from a trusted proxy", () => {
    expect(requestScheme(headers({ [PEER]: "10.0.0.2", "x-forwarded-proto": "https" }), true, auto)).toBe("https");
    expect(requestScheme(headers({ [PEER]: "10.0.0.2", "x-forwarded-proto": "https, http" }), true, auto)).toBe("https");
    // A public client claiming https does not get Secure-only behaviour it cannot use; it is plain http to us.
    expect(requestScheme(headers({ [PEER]: "203.0.113.9", "x-forwarded-proto": "https" }), true, auto)).toBe("http");
    expect(requestScheme(headers({ [PEER]: "10.0.0.2", "x-forwarded-proto": "https" }), true, { ...auto, mode: "off" })).toBe("http");
    expect(requestScheme(headers({ [PEER]: "127.0.0.1" }), true, auto)).toBe("http");
  });
});

describe("secureCookieDecision", () => {
  it("follows the address the site is served on, so plain-HTTP intranets can still sign in", () => {
    const decide = (input: Partial<Parameters<typeof secureCookieDecision>[0]>) =>
      secureCookieDecision({ mode: "auto", publicUrl: null, scheme: null, production: true, ...input });
    expect(decide({ publicUrl: "https://status.example.com" })).toBe(true);
    expect(decide({ publicUrl: "http://10.0.0.5:3301" })).toBe(false);
    expect(decide({ scheme: "https" })).toBe(true);
    expect(decide({ scheme: "http" })).toBe(false);
    // Nothing known: keep today's behaviour.
    expect(decide({})).toBe(true);
    expect(decide({ production: false })).toBe(false);
    expect(decide({ mode: "always", publicUrl: "http://10.0.0.5:3301", scheme: "http" })).toBe(true);
  });
});

describe("hstsValue", () => {
  it("is sent only over HTTPS, and in Auto only when the public address is HTTPS too", () => {
    const hsts = (input: Partial<Parameters<typeof hstsValue>[0]>) => hstsValue({ mode: "auto", publicUrl: null, scheme: "https", ...input });
    expect(hsts({ publicUrl: "https://status.example.com" })).toBe("max-age=15552000");
    expect(hsts({ publicUrl: null })).toBeNull();
    expect(hsts({ publicUrl: "http://status.example.com" })).toBeNull();
    expect(hsts({ publicUrl: "https://status.example.com", scheme: "http" })).toBeNull();
    expect(hsts({ mode: "on" })).toBe("max-age=15552000");
    expect(hsts({ mode: "on", scheme: "http" })).toBeNull();
    expect(hsts({ mode: "off", publicUrl: "https://status.example.com" })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { securityPosture, type PostureInput } from "../lib/settings/posture";
import { SETTINGS } from "../lib/settings/registry";

const defaults = Object.fromEntries(SETTINGS.map((definition) => [definition.key, definition.default])) as unknown as PostureInput["settings"];
const input = (over: Partial<PostureInput> = {}, settings: Partial<PostureInput["settings"]> = {}): PostureInput => ({
  settings: { ...defaults, ...settings }, proxy: { mode: "auto", hops: 1, cidrs: [] }, scheme: "http", behindProxy: "no", loosenedLimits: 0, ...over,
});
const status = (posture: ReturnType<typeof securityPosture>, id: string) => posture.items.find((item) => item.id === id)?.status;

describe("securityPosture", () => {
  it("scores a hardened setup higher than the defaults, and never reports a zero-item list", () => {
    const hardened = securityPosture(input({ scheme: "https", behindProxy: "yes", proxy: { mode: "auto", hops: 1, cidrs: ["10.244.0.0/16"] } }, {
      publicUrl: "https://status.example.com", hsts: "on", secureCookies: "always", adminCidrs: ["203.0.113.0/24"], sessionIdleSeconds: 4 * 3600, passwordMinLength: 16,
    }));
    const plain = securityPosture(input());
    expect(plain.items.length).toBeGreaterThan(5);
    expect(hardened.score).toBeGreaterThan(plain.score);
    expect(hardened.items.filter((item) => item.status === "warn")).toEqual([]);
  });

  it("flags the real risks", () => {
    expect(status(securityPosture(input({}, { publicUrl: "http://status.example.com" })), "https")).toBe("warn");
    expect(status(securityPosture(input({ proxy: { mode: "on", hops: 1, cidrs: [] }, behindProxy: "no" })), "proxy")).toBe("warn");
    expect(status(securityPosture(input({}, { sessionIdleSeconds: 3 * 86400 })), "sessions")).toBe("warn");
    expect(status(securityPosture(input({ loosenedLimits: 3 })), "rate-limits")).toBe("info");
  });

  it("suggests pinning the proxy range only when a proxy is actually in front", () => {
    expect(status(securityPosture(input({ behindProxy: "yes" })), "proxy")).toBe("info");
    expect(status(securityPosture(input({ behindProxy: "no" })), "proxy")).toBe("ok");
  });

  it("treats a public address, HSTS and Secure cookies as a chain that must agree", () => {
    const p = securityPosture(input({ scheme: "https" }, { publicUrl: "https://status.example.com" }));
    expect(status(p, "https")).toBe("ok");
    expect(status(p, "hsts")).toBe("ok");
    expect(status(p, "cookies")).toBe("ok");
    expect(status(securityPosture(input({ scheme: "http" })), "hsts")).toBe("info");
  });
});

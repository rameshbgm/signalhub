import { describe, expect, it } from "vitest";
import { proxyInputSchema } from "../lib/proxies";
import { canManageProxies, proxyLabel } from "../lib/proxy-shared";

const base = { protocol: "HTTP", host: "proxy.internal", port: 3128, hasAuth: false, username: "", password: "", enabled: true, isDefault: false, applyToAll: false } as const;

describe("proxyInputSchema", () => {
  it("accepts hostnames, IPv4 and bracketed IPv6 and strips the brackets", () => {
    expect(proxyInputSchema.parse(base).host).toBe("proxy.internal");
    expect(proxyInputSchema.parse({ ...base, host: " 10.0.0.5 " }).host).toBe("10.0.0.5");
    expect(proxyInputSchema.parse({ ...base, host: "[::1]" }).host).toBe("::1");
  });

  it("rejects a scheme, a port or whitespace in the server field", () => {
    for (const host of ["http://proxy", "proxy:3128", "pro xy", "", "-bad.example"]) {
      expect(proxyInputSchema.safeParse({ ...base, host }).success, host).toBe(false);
    }
  });

  it("limits the port and protocol", () => {
    expect(proxyInputSchema.safeParse({ ...base, port: 0 }).success).toBe(false);
    expect(proxyInputSchema.safeParse({ ...base, port: 65536 }).success).toBe(false);
    expect(proxyInputSchema.safeParse({ ...base, protocol: "FTP" }).success).toBe(false);
    expect(proxyInputSchema.safeParse({ ...base, protocol: "SOCKS5" }).success).toBe(true);
  });
});

describe("proxyLabel", () => {
  it("formats a proxy as a URL and brackets IPv6", () => {
    expect(proxyLabel({ protocol: "SOCKS5", host: "proxy.internal", port: 1080 })).toBe("socks5://proxy.internal:1080");
    expect(proxyLabel({ protocol: "HTTP", host: "::1", port: 3128 })).toBe("http://[::1]:3128");
  });
});

describe("canManageProxies", () => {
  it("lets admins and members with access to every page change shared proxies", () => {
    expect(canManageProxies({ role: "ADMIN", pageIds: ["a"] })).toBe(true);
    expect(canManageProxies({ role: "RESPONDER", pageIds: null })).toBe(true);
  });

  it("keeps page-scoped members from changing proxies other pages depend on", () => {
    expect(canManageProxies({ role: "RESPONDER", pageIds: ["a"] })).toBe(false);
    expect(canManageProxies({ role: "RESPONDER", pageIds: [] })).toBe(false);
  });
});

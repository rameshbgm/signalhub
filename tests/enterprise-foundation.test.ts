import { describe, expect, it } from "vitest";
import { addressAllowed, ipv4InCidr } from "../lib/network-policy";
import { openApiDocument } from "../lib/openapi";
import { newPasswordError, passwordMinimumLength } from "../lib/password-policy";
import { developmentQuickLoginAllowed } from "../lib/dev-accounts";

describe("enterprise network policy", () => {
  it("matches exact IPv4 addresses and CIDR boundaries", () => {
    expect(ipv4InCidr("10.2.3.4", "10.0.0.0/8")).toBe(true);
    expect(ipv4InCidr("11.2.3.4", "10.0.0.0/8")).toBe(false);
    expect(ipv4InCidr("203.0.113.8", "203.0.113.8")).toBe(true);
    expect(ipv4InCidr("203.0.113.9", "203.0.113.8")).toBe(false);
    expect(ipv4InCidr("not-an-ip", "10.0.0.0/8")).toBe(false);
  });

  it("treats an empty allowlist as unrestricted and a populated list as restrictive", () => {
    expect(addressAllowed("unknown", [])).toBe(true);
    expect(addressAllowed("192.0.2.10", ["192.0.2.0/24"])).toBe(true);
    expect(addressAllowed("198.51.100.10", ["192.0.2.0/24"])).toBe(false);
  });
});

describe("versioned public API contract", () => {
  it("publishes management and SCIM authentication surfaces", () => {
    expect(openApiDocument.openapi).toBe("3.1.0");
    expect(openApiDocument.components.securitySchemes.apiKey).toBeTruthy();
    expect(openApiDocument.paths["/api/v1/manage/incidents"]).toBeTruthy();
    expect(openApiDocument.paths["/api/scim/v2/{connection}/Users"]).toBeTruthy();
    expect(openApiDocument.paths["/api/scim/v2/{connection}/Groups"]).toBeTruthy();
  });
});

describe("enterprise password policy", () => {
  it("defaults to a 14-character minimum and rejects identity-derived passwords", () => {
    expect(passwordMinimumLength()).toBe(14);
    expect(newPasswordError("too-short")).toContain("14");
    expect(newPasswordError("Owner-Enterprise-2026!", ["Owner", "owner@example.com"]))
      .toContain("name or email");
    expect(newPasswordError("K7!zQ4@rT9#vL2$x")).toBeNull();
  });
});

describe("development quick login boundary", () => {
  it("requires an explicit opt-in, a non-production runtime, and a loopback host", () => {
    expect(developmentQuickLoginAllowed({
      nodeEnv: "development",
      enabled: "true",
      hostname: "localhost",
    })).toBe(true);
    expect(developmentQuickLoginAllowed({
      nodeEnv: "production",
      enabled: "true",
      hostname: "localhost",
    })).toBe(false);
    expect(developmentQuickLoginAllowed({
      nodeEnv: "development",
      enabled: "true",
      hostname: "status.example.com",
    })).toBe(false);
    expect(developmentQuickLoginAllowed({
      nodeEnv: "development",
      enabled: "false",
      hostname: "localhost",
    })).toBe(false);
  });
});

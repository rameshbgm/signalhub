import { describe, expect, it } from "vitest";
import {
  hasPlatformCapability,
  normalizedPlatformRole,
  platformAdminIsActive,
} from "../lib/platform-roles";
import {
  encodeBase32,
  generateRecoveryCodes,
  hashRecoveryCode,
  totpCode,
  verifyTotp,
} from "../lib/totp";
import { organizationIsActive, organizationStatus } from "../lib/organization-state";
import { formatPageDate, pageDateKey } from "../lib/page-locale";
import { sessionHasCapability } from "../lib/identity";

describe("platform role policy", () => {
  it("keeps auditors read-only and reserves administrator management for owners", () => {
    expect(hasPlatformCapability("AUDITOR", "audit.read")).toBe(true);
    expect(hasPlatformCapability("AUDITOR", "organizations.suspend")).toBe(false);
    expect(hasPlatformCapability("OPERATOR", "operations.retry")).toBe(true);
    expect(hasPlatformCapability("OPERATOR", "organizations.purge")).toBe(false);
    expect(hasPlatformCapability("OPERATOR", "admins.manage")).toBe(false);
    expect(hasPlatformCapability("OWNER", "admins.manage")).toBe(true);
  });

  it("safely normalizes migrated accounts", () => {
    expect(normalizedPlatformRole({})).toBe("OWNER");
    expect(platformAdminIsActive({})).toBe(true);
    expect(platformAdminIsActive({ status: "DISABLED" })).toBe(false);
  });
});

describe("platform TOTP", () => {
  it("matches the RFC 6238 SHA-1 vector after six-digit truncation", () => {
    const secret = encodeBase32(Buffer.from("12345678901234567890", "ascii"));
    expect(totpCode(secret, 59_000)).toBe("287082");
    expect(verifyTotp(secret, "287082", 59_000)).toBe(true);
    expect(verifyTotp(secret, "000000", 59_000)).toBe(false);
  });

  it("normalizes recovery codes before hashing", () => {
    const [code] = generateRecoveryCodes(1);
    expect(code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
    expect(hashRecoveryCode(code)).toBe(hashRecoveryCode(code.toLowerCase().replaceAll("-", " ")));
  });
});

describe("organization lifecycle compatibility", () => {
  it("maps legacy suspension and explicit lifecycle states", () => {
    expect(organizationStatus({})).toBe("ACTIVE");
    expect(organizationStatus({ suspended: true })).toBe("SUSPENDED");
    expect(organizationStatus({ suspended: false, status: "DELETING" })).toBe("DELETING");
    expect(organizationIsActive({ status: "ACTIVE" })).toBe(true);
    expect(organizationIsActive({ status: "PROVISIONING" })).toBe(false);
  });
});

describe("support-session capability policy", () => {
  it("keeps view sessions read-only while preserving audit and analytics access", () => {
    const viewSession = {
      role: "VIEWER",
      supportActorEmail: "operator@example.com",
      supportMode: "VIEW" as const,
      supportScopes: [],
    };
    expect(sessionHasCapability(viewSession, "analytics.view")).toBe(true);
    expect(sessionHasCapability(viewSession, "audit.view")).toBe(true);
    expect(sessionHasCapability(viewSession, "incident.update")).toBe(false);
  });

  it("limits operate sessions to their explicit scopes", () => {
    const operateSession = {
      role: "ADMIN",
      supportActorEmail: "operator@example.com",
      supportMode: "OPERATE" as const,
      supportScopes: ["incident.update"],
    };
    expect(sessionHasCapability(operateSession, "incident.update")).toBe(true);
    expect(sessionHasCapability(operateSession, "page.configure")).toBe(false);
  });
});

describe("status-page locale settings", () => {
  it("uses the configured locale and timezone for calendar dates", () => {
    const instant = new Date("2026-07-25T16:30:00.000Z");
    expect(pageDateKey(instant, "UTC")).toBe("2026-07-25");
    expect(pageDateKey(instant, "Asia/Singapore")).toBe("2026-07-26");
    expect(
      formatPageDate(instant, {
        language: "en-GB",
        timeZone: "Asia/Singapore",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    ).toContain("26");
  });
});

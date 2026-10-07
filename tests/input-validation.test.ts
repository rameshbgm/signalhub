import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { databaseInputErrorMessage } from "@/lib/database-errors";
import { INPUT_LIMITS, isValidEmail, isValidSmsCountryCode } from "@/lib/input-limits";

const source = (path: string) => readFileSync(path, "utf8");

describe("shared input limits", () => {
  it("validates emails including the RFC 5321 length cap", () => {
    expect(isValidEmail("ops@example.com")).toBe(true);
    expect(isValidEmail("no-at-sign.example.com")).toBe(false);
    expect(isValidEmail(`${"a".repeat(243)}@example.com`)).toBe(false);
    expect(isValidEmail(`${"a".repeat(242)}@example.com`)).toBe(true);
  });

  it("accepts only + followed by a 1–4 digit country code", () => {
    for (const valid of ["+1", "+44", "+353", "+1868"]) expect(isValidSmsCountryCode(valid)).toBe(true);
    for (const invalid of ["1", "+0", "+12345", "+1 ", "+a"]) expect(isValidSmsCountryCode(invalid)).toBe(false);
  });
});

describe("database input errors", () => {
  it("maps Postgres input failures to client-safe messages and ignores everything else", () => {
    expect(databaseInputErrorMessage({ code: "22P02" })).toMatch(/malformed/);
    expect(databaseInputErrorMessage({ code: "22001" })).toMatch(/too long/);
    expect(databaseInputErrorMessage({ code: "40001" })).toBeNull();
    expect(databaseInputErrorMessage(new Error("boom"))).toBeNull();
    expect(databaseInputErrorMessage(null)).toBeNull();
  });

  it("is applied by both the server action feedback and the API error path", () => {
    expect(source("app/platform/(protected)/action-feedback.ts")).toContain("databaseInputErrorMessage(error)");
    expect(source("lib/api-response.ts")).toContain("databaseInputErrorMessage(error)");
  });
});

describe("server and form limits stay in sync", () => {
  // Each pair: server file enforcing the limit, form file declaring the same limit.
  const pairs: [server: string, form: string, limit: string][] = [
    ["app/admin/(protected)/metrics/actions.ts", "app/admin/(protected)/metrics/page.tsx", "INPUT_LIMITS.metricSuffix"],
    ["app/admin/(protected)/settings/actions.ts", "components/platform/OrganizationSettingsSection.tsx", "INPUT_LIMITS.name"],
    ["app/admin/(protected)/incidents/actions.ts", "components/admin/IncidentCommunicationForms.tsx", "INPUT_LIMITS.postmortem"],
    ["app/admin/(protected)/maintenance/actions.ts", "components/admin/IncidentCommunicationForms.tsx", "INPUT_LIMITS.body"],
    ["app/admin/(protected)/pages/actions.ts", "app/admin/(protected)/pages/[pageId]/settings/page.tsx", "INPUT_LIMITS.url"],
    ["app/admin/(protected)/pages/[pageId]/access-actions.ts", "app/admin/(protected)/pages/[pageId]/access/page.tsx", "INPUT_LIMITS.password"],
    ["lib/domain/monitors.ts", "components/admin/MonitorForm.tsx", "INPUT_LIMITS.monitorRequestBody"],
    ["app/platform/(protected)/orgs/actions.ts", "components/platform/CreateOrganizationForm.tsx", "INPUT_LIMITS.reason"],
    ["app/platform/(protected)/audit/actions.ts", "app/platform/(protected)/audit/page.tsx", "INPUT_LIMITS.secret"],
  ];
  it.each(pairs)("%s and %s both use %s", (server, form, limit) => {
    expect(source(server)).toContain(limit);
    expect(source(form)).toContain(limit);
  });

  it("guards malformed ids in the shared page and component asserts", () => {
    const guard = source("lib/admin-guard.ts");
    expect(guard.match(/!isDatabaseId\(/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("has no copy-pasted email regex left in server actions", () => {
    for (const file of ["app/admin/(protected)/team/actions.ts", "app/admin/(protected)/subscribers/actions.ts", "app/admin/(protected)/pages/[pageId]/access-actions.ts"]) {
      expect(source(file)).not.toContain("[^\\s@]+@");
      expect(source(file)).toContain("isValidEmail(");
    }
  });

  it("keeps the email cap at the RFC limit", () => {
    expect(INPUT_LIMITS.email).toBe(254);
  });
});

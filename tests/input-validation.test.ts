import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { databaseInputErrorMessage } from "@/lib/database-errors";
import { INPUT_LIMITS, MONITOR_TAGS_PATTERN, isValidEmail, isValidSmsCountryCode } from "@/lib/input-limits";

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

  it("drives delivery provider limits from the shared module on both sides", () => {
    const server = source("app/platform/(protected)/configuration/actions.ts");
    for (const limit of ["smtpHost", "smtpPassword", "smtpFrom", "smsAccountId", "smsSecret", "smsSender"]) {
      expect(server).toContain(`INPUT_LIMITS.${limit}`);
    }
    expect(server).toContain("E164_PATTERN");
    expect(source("components/platform/DeliveryProviderFields.tsx")).toContain("INPUT_LIMITS.smsSecret");
    expect(source("components/platform/DeliveryProvidersCard.tsx")).toContain("pattern={E164_PATTERN}");
  });

  it("keeps CSV imports under the server action body limit", () => {
    // Next's default server action body limit is 1 MB; leave room for the multipart envelope.
    expect(INPUT_LIMITS.csvText).toBeLessThan(1_000_000);
    expect(source("app/admin/(protected)/subscribers/actions.ts")).toContain("INPUT_LIMITS.csvText");
    expect(source("app/admin/(protected)/subscribers/page.tsx")).toContain("maxLength={INPUT_LIMITS.csvText}");
  });
});

describe("monitor tags pattern", () => {
  // Browsers compile the pattern attribute with the v flag and anchor it.
  const matches = (value: string) => new RegExp(`^(?:${MONITOR_TAGS_PATTERN})$`, "v").test(value);

  it("accepts what the server accepts and rejects what it rejects", () => {
    expect(matches("")).toBe(true);
    expect(matches("api, prod , eu-west")).toBe(true);
    expect(matches(`edge, ${"a".repeat(INPUT_LIMITS.monitorTag)}`)).toBe(true);
    expect(matches("a".repeat(INPUT_LIMITS.monitorTag + 1))).toBe(false);
    expect(matches(Array(INPUT_LIMITS.monitorTags).fill("t").join(", "))).toBe(true);
    expect(matches(Array(INPUT_LIMITS.monitorTags + 1).fill("t").join(", "))).toBe(false);
  });

  it("is used by the shared create and edit monitor form", () => {
    expect(source("components/admin/MonitorForm.tsx")).toContain("pattern={MONITOR_TAGS_PATTERN}");
    expect(source("components/admin/MonitorDrawer.tsx")).toContain("<MonitorForm");
    // Edit values are picked field by field so stored secrets never reach the client.
    const monitorsPage = source("app/admin/(protected)/monitors/page.tsx");
    expect(monitorsPage).toContain("hasAuthSecret: Boolean(m.authSecret)");
    expect(monitorsPage).toContain("edit: canManage ? formValues(m) : null");
    expect(monitorsPage).not.toMatch(/authSecret: m\.authSecret|heartbeatTokenHash: m\./);
  });
});

describe("route errors", () => {
  it("renders a 404 for missing or malformed page and event ids", () => {
    expect(source("app/admin/(protected)/pages/[pageId]/layout.tsx")).toContain("notFoundIfMissing(requireCapability");
    expect(source("components/admin/EventDetail.tsx")).toContain("if (!isDatabaseId(incidentId)) notFound();");
    expect(source("app/admin/(protected)/not-found.tsx")).toContain("export default function AdminNotFound");
  });

  it("leaves no server action form that bypasses inline error feedback", () => {
    const plain = ["app", "components"]
      .flatMap((dir) => readdirSync(dir, { recursive: true, encoding: "utf8" }).map((file) => `${dir}/${file}`))
      .filter((file) => file.endsWith(".tsx") && source(file).includes("<form action={"));
    // These two already report errors through useActionState.
    expect(plain.sort()).toEqual(["components/admin/TeamMemberCreateForm.tsx", "components/platform/CreateOrganizationForm.tsx"]);
  });
});

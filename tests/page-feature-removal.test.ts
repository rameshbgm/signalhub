import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("removed page recovery and communication templates", () => {
  it("permanently deletes a page only after server-side name confirmation", () => {
    const actions = source("app/admin/(protected)/pages/actions.ts");
    const settings = source("app/admin/(protected)/pages/[pageId]/settings/page.tsx");

    expect(actions).toContain("export async function deletePage(pageId: string, formData: FormData)");
    expect(actions).toContain('formData.get("confirmation")');
    expect(actions).toContain("deletePageCascade(pageId, session.orgId");
    expect(actions).toContain('"DELETE_PAGE"');
    expect(actions).not.toContain("restorePage");
    expect(actions).not.toContain("permanentlyDeletePage");
    expect(settings).toContain('name="confirmation"');
    expect(settings).toContain("Permanently deletes this page");
  });

  it("removes recovery, communication-template, and monitor-template configuration", () => {
    const navigation = source("components/admin/AdminNav.tsx");
    const schema = source("lib/postgres/schema.ts");
    const communicationMigration = source("db/migrations/005_remove_communication_templates.sql");
    const monitorMigration = source("db/migrations/006_remove_monitor_templates.sql");
    const monitors = source("app/admin/(protected)/monitors/page.tsx");
    const monitorActions = source("app/admin/(protected)/monitors/actions.ts");
    const platformConfiguration = source("app/platform/(protected)/configuration/page.tsx");

    expect(navigation).not.toContain("/organization/pages/deleted");
    expect(navigation).not.toContain("/organization/templates");
    expect(navigation).not.toContain("Monitor Templates");
    expect(schema).not.toContain("incidentTemplates");
    expect(schema).not.toContain("templateGroups");
    expect(schema).not.toContain("monitorTemplates");
    expect(schema).not.toContain("templateId: string | null");
    expect(communicationMigration).toContain("DROP TABLE IF EXISTS incident_templates");
    expect(communicationMigration).toContain("DROP TABLE IF EXISTS template_groups");
    expect(monitorMigration).toContain("ALTER TABLE monitors DROP COLUMN IF EXISTS template_id");
    expect(monitorMigration).toContain("DROP TABLE IF EXISTS monitor_templates");
    expect(monitors).not.toContain("Global monitor templates");
    expect(monitorActions).not.toContain("addMonitorTemplate");
    expect(monitorActions).not.toContain("removeMonitorTemplate");
    expect(platformConfiguration).not.toContain("/organization/platform/templates");
  });
});

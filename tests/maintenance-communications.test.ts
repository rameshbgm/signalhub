import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { tsImport } from "tsx/esm/api";

process.env.DATABASE_URL ??= "mongodb://127.0.0.1:27017/status-unit-tests";

const parentURL = pathToFileURL(import.meta.filename).href;
const maintenance = (await tsImport(
  "../lib/domain/maintenance.ts",
  parentURL
)) as typeof import("../lib/domain/maintenance");
const communications = (await tsImport(
  "../components/admin/IncidentCommunicationForms.tsx",
  parentURL
)) as typeof import("../components/admin/IncidentCommunicationForms");

describe("maintenance reminder eligibility", () => {
  const now = new Date("2026-07-25T04:00:00.000Z");
  const scheduled = {
    maintenanceStatus: "SCHEDULED",
    scheduledStart: new Date("2026-07-25T05:00:00.000Z"),
    reminderMinutesBefore: 60,
    reminderSentAt: null,
  };

  it("is due exactly at the configured boundary", () => {
    expect(maintenance.isMaintenanceReminderDue(scheduled, now)).toBe(true);
    expect(
      maintenance.isMaintenanceReminderDue(
        {
          ...scheduled,
          scheduledStart: new Date("2026-07-25T05:00:00.001Z"),
        },
        now
      )
    ).toBe(false);
  });

  it("rejects repeats, late reminders, invalid windows, and non-scheduled work", () => {
    expect(
      maintenance.isMaintenanceReminderDue(
        { ...scheduled, reminderSentAt: now },
        now
      )
    ).toBe(false);
    expect(
      maintenance.isMaintenanceReminderDue(
        {
          ...scheduled,
          scheduledStart: new Date("2026-07-25T03:59:59.999Z"),
        },
        now
      )
    ).toBe(false);
    expect(
      maintenance.isMaintenanceReminderDue(
        { ...scheduled, reminderMinutesBefore: 4 },
        now
      )
    ).toBe(false);
    expect(
      maintenance.isMaintenanceReminderDue(
        { ...scheduled, reminderMinutesBefore: 10_081 },
        now
      )
    ).toBe(false);
    expect(
      maintenance.isMaintenanceReminderDue(
        { ...scheduled, maintenanceStatus: "IN_PROGRESS" },
        now
      )
    ).toBe(false);
  });
});

describe("incident lifecycle communication templates", () => {
  it("renders shared variables and preserves unknown placeholders", () => {
    const values = communications.communicationTemplateValues({
      incidentName: "Database maintenance",
      pageName: "Acme Status",
      componentNames: ["Primary database", "API"],
      status: "SCHEDULED",
      impact: "NONE",
    });
    expect(
      communications.renderCommunicationTemplate(
        "{{maintenance}} on {{page}} affects {{components}} ({{status}}/{{impact}}) {{owner}}",
        values
      )
    ).toBe(
      "Database maintenance on Acme Status affects Primary database, API (SCHEDULED/NONE) {{owner}}"
    );
  });

  it("honors explicit notify defaults and defaults legacy templates to notify", () => {
    expect(communications.templateNotifyByDefault({})).toBe(true);
    expect(
      communications.templateNotifyByDefault({ notifyByDefault: true })
    ).toBe(true);
    expect(
      communications.templateNotifyByDefault({ notifyByDefault: false })
    ).toBe(false);
  });
});

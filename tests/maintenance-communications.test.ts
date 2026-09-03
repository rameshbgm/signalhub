import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgresql://signalhub:signalhub@127.0.0.1:5432/status_unit_tests";

const maintenance = await import("../lib/domain/maintenance");

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

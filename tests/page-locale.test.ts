import { describe, expect, it } from "vitest";
import { isValidTimeZone, utcToZonedDateTime, zonedDateTimeToUtc } from "../lib/page-locale";

describe("page time zone conversion", () => {
  it("interprets datetime-local input as wall-clock time in the page time zone", () => {
    expect(zonedDateTimeToUtc("2026-07-25T09:30", "UTC").toISOString()).toBe("2026-07-25T09:30:00.000Z");
    expect(zonedDateTimeToUtc("2026-07-25T09:30", "Asia/Kolkata").toISOString()).toBe("2026-07-25T04:00:00.000Z");
    expect(zonedDateTimeToUtc("2026-01-15T09:00", "America/New_York").toISOString()).toBe("2026-01-15T14:00:00.000Z");
    expect(zonedDateTimeToUtc("2026-07-15T09:00", "America/New_York").toISOString()).toBe("2026-07-15T13:00:00.000Z");
  });

  it("round-trips through the form representation", () => {
    for (const zone of ["UTC", "Europe/Berlin", "Australia/Adelaide", "America/Los_Angeles"]) {
      const instant = zonedDateTimeToUtc("2026-03-29T12:15", zone);
      expect(utcToZonedDateTime(instant, zone)).toBe("2026-03-29T12:15");
    }
  });

  it("rejects malformed input and unknown zones", () => {
    expect(Number.isNaN(zonedDateTimeToUtc("not a date", "UTC").getTime())).toBe(true);
    expect(isValidTimeZone("Europe/Berlin")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});

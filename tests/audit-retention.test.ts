import { describe, expect, it } from "vitest";
import { auditRetentionCutoff } from "../lib/audit-retention";

describe("audit retention", () => {
  it("keeps exactly the latest six calendar months", () => {
    expect(auditRetentionCutoff(new Date("2026-07-27T12:00:00.000Z")).toISOString())
      .toBe("2026-01-27T12:00:00.000Z");
    expect(auditRetentionCutoff(new Date("2026-08-31T12:00:00.000Z")).toISOString())
      .toBe("2026-02-28T12:00:00.000Z");
  });
});

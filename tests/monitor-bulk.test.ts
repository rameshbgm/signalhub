import { describe, expect, it } from "vitest";
import { bulkMonitorDeletePhrase, isBulkMonitorIntent, matchesBulkMonitorDeletePhrase, monitorCountLabel } from "../lib/monitor-bulk";

describe("bulk monitor rules", () => {
  it("accepts only the four intents", () => {
    for (const intent of ["run", "pause", "resume", "delete"]) expect(isBulkMonitorIntent(intent)).toBe(true);
    for (const intent of ["remove", "", null, 3]) expect(isBulkMonitorIntent(intent)).toBe(false);
  });

  it("pluralises and builds the delete phrase from the count", () => {
    expect(monitorCountLabel(1)).toBe("1 monitor");
    expect(monitorCountLabel(3)).toBe("3 monitors");
    expect(bulkMonitorDeletePhrase(2)).toBe("delete 2 monitors");
  });

  it("matches the phrase ignoring case and padding, but only for the same count", () => {
    expect(matchesBulkMonitorDeletePhrase("  Delete 2 Monitors ", 2)).toBe(true);
    expect(matchesBulkMonitorDeletePhrase("delete 2 monitors", 3)).toBe(false);
  });
});

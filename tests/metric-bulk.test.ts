import { describe, expect, it } from "vitest";
import { bulkMetricDeletePhrase, isBulkMetricIntent, matchesBulkMetricDeletePhrase, metricCountLabel } from "../lib/metric-bulk";

describe("bulk metric rules", () => {
  it("accepts only show, hide and delete", () => {
    for (const intent of ["show", "hide", "delete"]) expect(isBulkMetricIntent(intent)).toBe(true);
    for (const intent of ["pause", "", null]) expect(isBulkMetricIntent(intent)).toBe(false);
  });

  it("builds the delete phrase from the count and matches it loosely", () => {
    expect(metricCountLabel(1)).toBe("1 metric");
    expect(bulkMetricDeletePhrase(2)).toBe("delete 2 metrics");
    expect(matchesBulkMetricDeletePhrase(" Delete 2 Metrics ", 2)).toBe(true);
    expect(matchesBulkMetricDeletePhrase("delete 2 metrics", 3)).toBe(false);
  });
});

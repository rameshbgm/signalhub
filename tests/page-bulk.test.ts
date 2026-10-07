import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BULK_PAGE_LIMIT, bulkDeletePhrase, isBulkPageIntent, matchesBulkDeletePhrase } from "@/lib/page-bulk";

describe("bulk page action rules", () => {
  it("builds a singular or plural delete phrase and matches it loosely on case and whitespace", () => {
    expect(bulkDeletePhrase(1)).toBe("delete 1 page");
    expect(bulkDeletePhrase(3)).toBe("delete 3 pages");
    expect(matchesBulkDeletePhrase("  Delete 3 Pages ", 3)).toBe(true);
    expect(matchesBulkDeletePhrase("delete 3 pages", 2)).toBe(false);
    expect(matchesBulkDeletePhrase("delete 1 pages", 1)).toBe(false);
  });

  it("accepts only known intents", () => {
    expect(["publish", "hide", "remove", "delete"].every(isBulkPageIntent)).toBe(true);
    expect(isBulkPageIntent("archive")).toBe(false);
    expect(isBulkPageIntent(null)).toBe(false);
  });

  it("uses the shared rules on both the server action and the pages list UI", () => {
    const actions = readFileSync("app/admin/(protected)/pages/actions.ts", "utf8");
    const ui = readFileSync("components/admin/page-group.tsx", "utf8");
    for (const rule of ["BULK_PAGE_LIMIT", "matchesBulkDeletePhrase", "bulkDeletePhrase"]) {
      expect(actions).toContain(rule);
      expect(ui).toContain(rule);
    }
    expect(actions).toContain("pageIds.every(isDatabaseId)");
    expect(actions).toContain('.where("isHub", "=", true)');
    expect(actions).toContain("no longer in this hub");
    expect(BULK_PAGE_LIMIT).toBe(100);
  });
});

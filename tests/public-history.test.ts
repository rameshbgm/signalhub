import { describe, expect, it } from "vitest";
import { recentHistory } from "../lib/public-history";

describe("public history date window", () => {
  it("includes the full first day of the window, excludes older and future events, and sorts newest first", () => {
    const now = new Date("2026-10-16T12:00:00Z");
    const rows = [
      { id: "boundary", createdAt: new Date("2026-07-19T00:00:00Z") },
      { id: "old", createdAt: new Date("2026-07-18T23:59:59Z") },
      { id: "recent", createdAt: new Date("2026-10-15T12:00:00Z") },
      { id: "future", createdAt: new Date("2026-10-17T00:00:00Z") },
    ];
    expect(recentHistory(rows, 90, now).map((row) => row.id)).toEqual(["recent", "boundary"]);
    expect(recentHistory(rows, 30, now).map((row) => row.id)).toEqual(["recent"]);
    expect(recentHistory(rows, 180, now).map((row) => row.id)).toEqual(["recent", "boundary", "old"]);
  });
});

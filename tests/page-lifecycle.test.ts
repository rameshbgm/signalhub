import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { activePageFilter, deletedPageFilter, publicPageFilter } from "../lib/page-lifecycle";

describe("page lifecycle filters", () => {
  it("treats legacy missing lifecycle values as active and publicly visible", () => {
    expect(activePageFilter({ slug: "status" })).toEqual({ slug: "status", deletedAt: null });
    expect(publicPageFilter({ slug: "status" })).toEqual({
      slug: "status",
      deletedAt: null,
      publicVisible: { $ne: false },
    });
  });

  it("selects only soft-deleted pages for recovery", () => {
    expect(deletedPageFilter({ orgId: "org" as never })).toEqual({
      orgId: "org",
      deletedAt: { $ne: null },
    });
  });

  it("requires a confirmation and exposes restore navigation", () => {
    const overview = readFileSync("app/admin/(protected)/pages/[pageId]/page.tsx", "utf8");
    const settings = readFileSync("app/admin/(protected)/pages/[pageId]/settings/page.tsx", "utf8");
    const nav = readFileSync("components/admin/AdminNav.tsx", "utf8");
    expect(settings).toContain("This page will become unavailable to everyone");
    expect(overview).toContain("Hide from public");
    expect(nav).toContain("Deleted Pages");
  });
});

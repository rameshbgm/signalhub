import { describe, expect, it, vi } from "vitest";
import { pagePickerHref, pageScopedHref, pageSelectionCookieName, resolvePageSelection } from "@/lib/page-selection";

const jar = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => jar }));
const { selectedPage } = await import("@/lib/selected-page");

const pages = [{ id: "first", name: "First" }, { id: "chosen", name: "Chosen" }];
const scope = { orgId: "organization", userId: "user" };

describe("persistent status-page selection", () => {
  it("uses an explicit accessible URL, then the remembered page, then a safe fallback", () => {
    expect(resolvePageSelection(pages, "first", "chosen")?.id).toBe("first");
    expect(resolvePageSelection(pages, undefined, "chosen")?.id).toBe("chosen");
    expect(resolvePageSelection(pages, "unavailable", "chosen")?.id).toBe("chosen");
    expect(resolvePageSelection(pages, undefined, "deleted")?.id).toBe("first");
    expect(resolvePageSelection([], undefined, "chosen")).toBeUndefined();
  });

  it("never restores a deleted, foreign or newly inaccessible page", () => {
    expect(resolvePageSelection(pages.slice(0, 1), "chosen", "chosen")?.id).toBe("first");
  });

  it("isolates preferences between users and organizations", () => {
    expect(pageSelectionCookieName(scope)).not.toBe(pageSelectionCookieName({ ...scope, userId: "other" }));
    expect(pageSelectionCookieName(scope)).not.toBe(pageSelectionCookieName({ ...scope, orgId: "other" }));
  });

  it("restores the remembered page on a fresh server request", async () => {
    jar.get.mockReturnValue({ value: "chosen" });
    expect((await selectedPage(pages, scope))?.id).toBe("chosen");
    expect(jar.get).toHaveBeenCalledWith(pageSelectionCookieName(scope));
    expect((await selectedPage(pages, scope, "first"))?.id).toBe("first");
  });

  it("keeps an explicit All pages event filter without erasing the single-page preference", () => {
    expect(resolvePageSelection(pages, "all", "chosen", true)).toBeUndefined();
    expect(resolvePageSelection(pages, undefined, undefined, true)).toBeUndefined();
    expect(resolvePageSelection(pages, undefined, "chosen", true)?.id).toBe("chosen");
    expect(pagePickerHref("/organization/events?show=maintenance", "", true)).toBe("/organization/events?show=maintenance&pageId=all");
  });

  it("carries the selected page across navigation without replacing explicit page links", () => {
    for (const path of ["monitors", "metrics", "analytics", "subscribers", "events", "notifications", "embed", "api-keys", "monitors/new", "metrics/new", "incidents/new", "maintenance/new"]) {
      expect(pageScopedHref(`/organization/${path}`, "chosen")).toBe(`/organization/${path}?pageId=chosen`);
    }
    expect(pageScopedHref("/organization/metrics?pageId=first", "chosen")).toBe("/organization/metrics?pageId=first");
    expect(pageScopedHref("/organization/security", "chosen")).toBe("/organization/security");
    expect(pageScopedHref("https://example.com/organization/metrics", "chosen")).toBe("https://example.com/organization/metrics");
  });

  it("replaces the old picker parameter and preserves other filters", () => {
    expect(pagePickerHref("/organization/monitors?pageId=first&sort=name", "chosen")).toBe("/organization/monitors?pageId=chosen&sort=name");
    expect(pagePickerHref("/organization/metrics", "chosen")).toBe("/organization/metrics?pageId=chosen");
  });
});

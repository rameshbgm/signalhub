import { describe, expect, it } from "vitest";
import { MAX_SAVED_VIEWS, flattenEntries, pageEntries, pageNumbers, parseViews, rollupTicks, type ListGroup } from "@/lib/list-views";

const group = (key: string, count: number): ListGroup<string> => ({ key, name: key, items: Array.from({ length: count }, (_, i) => `${key}${i}`) });
const groups = [group("a", 3), group("b", 4), group("c", 2)];

describe("flattenEntries", () => {
  it("lists every row under an open group header", () => {
    const entries = flattenEntries(groups, new Set(["a", "b", "c"]), true);
    expect(entries).toHaveLength(3 + 4 + 2 + 3);
    expect(entries[0]).toMatchObject({ kind: "group", continued: false });
  });

  it("gives a collapsed group only its header", () => {
    const entries = flattenEntries(groups, new Set(["b"]), true);
    expect(entries.map((e) => (e.kind === "group" ? `#${e.group.key}` : e.item))).toEqual(["#a", "#b", "b0", "b1", "b2", "b3", "#c"]);
  });

  it("emits rows only when not grouped", () => {
    const entries = flattenEntries([group("all", 3)], new Set(), false);
    expect(entries.every((e) => e.kind === "row")).toBe(true);
    expect(entries).toHaveLength(3);
  });
});

describe("pageEntries", () => {
  const entries = flattenEntries(groups, new Set(["a", "b", "c"]), true);

  it("slices, counts pages and clamps the page", () => {
    expect(pageEntries(entries, groups, 1, 5, true).pages).toBe(3);
    expect(pageEntries(entries, groups, 99, 5, true).page).toBe(3);
    expect(pageEntries(entries, groups, -4, 5, true).page).toBe(1);
    expect(pageEntries(entries, groups, Number.NaN, 5, true).page).toBe(1);
  });

  it("repeats the group header when a page starts mid-group", () => {
    const second = pageEntries(entries, groups, 2, 5, true).entries;
    expect(second[0]).toMatchObject({ kind: "group", continued: true });
    expect(second[0].kind === "group" && second[0].group.key).toBe("b");
  });

  it("does not repeat a header when the page already starts with one", () => {
    const first = pageEntries(entries, groups, 1, 4, true).entries;
    expect(first.filter((e) => e.kind === "group" && e.continued)).toHaveLength(0);
  });

  it("never adds a header to an ungrouped list", () => {
    const flat = flattenEntries([group("all", 12)], new Set(), false);
    expect(pageEntries(flat, [group("all", 12)], 2, 5, false).entries.every((e) => e.kind === "row")).toBe(true);
  });

  it("returns one empty page for an empty list", () => {
    expect(pageEntries([], [], 1, 25, true)).toEqual({ entries: [], page: 1, pages: 1 });
  });
});

describe("pageNumbers", () => {
  it("shows neighbours, ends and gaps", () => {
    expect(pageNumbers(1, 3)).toEqual([1, 2, 3]);
    expect(pageNumbers(5, 10)).toEqual([1, "…", 4, 5, 6, "…", 10]);
    expect(pageNumbers(1, 1)).toEqual([1]);
  });
});

describe("parseViews", () => {
  const view = { id: "v1", name: "On call", base: "attn", query: "api", tags: ["prod"], groupBy: "status", sort: "latency" };

  it("accepts well-formed views", () => {
    expect(parseViews(JSON.stringify([view]))).toEqual([view]);
  });

  it("returns nothing for missing, broken or non-array JSON", () => {
    expect(parseViews(null)).toEqual([]);
    expect(parseViews("{not json")).toEqual([]);
    expect(parseViews(JSON.stringify({ a: 1 }))).toEqual([]);
  });

  it("drops malformed entries and keeps the good ones", () => {
    const raw = JSON.stringify([view, { ...view, id: "" }, { ...view, name: "  " }, { ...view, tags: [1] }, { ...view, name: "x".repeat(41) }, null, "str"]);
    expect(parseViews(raw)).toEqual([view]);
  });

  it("caps the number of views", () => {
    const many = Array.from({ length: MAX_SAVED_VIEWS + 5 }, (_, i) => ({ ...view, id: `v${i}` }));
    expect(parseViews(JSON.stringify(many))).toHaveLength(MAX_SAVED_VIEWS);
  });
});

describe("rollupTicks", () => {
  it("is empty with no checks and fails when any monitor failed at that position", () => {
    expect(rollupTicks([], 3)).toEqual(["none", "none", "none"]);
    // Newest first: monitor A [ok, ok], monitor B [fail, ok] -> oldest position ok, newest fail.
    expect(rollupTicks([[true, true], [false, true]], 3)).toEqual(["none", "ok", "fail"]);
  });

  it("ignores monitors that have no check that far back", () => {
    expect(rollupTicks([[true], [true, false]], 2)).toEqual(["fail", "ok"]);
  });
});

import { describe, expect, it } from "vitest";
import { applyTableQuery, pageCount, parseTableQuery, tableHref, tableParams } from "@/lib/table-query";

const spec = { sorts: ["name", "created"], defaultSort: "created", filters: { status: ["active", "disabled"] } } as const;

describe("table query", () => {
  it("falls back to safe defaults for unknown or hostile values", () => {
    const query = parseTableQuery({ sort: "password_hash; drop", dir: "sideways", page: "-4", size: "9999", status: "banana", q: "  ann  " }, spec);
    expect(query).toMatchObject({ sort: "created", dir: "desc", page: 1, size: 25, q: "ann", filters: { status: "all" } });
  });

  it("keeps urls short by omitting defaults", () => {
    const query = parseTableQuery({}, spec);
    expect(tableHref("/x", tableParams(query, { sort: "created", dir: "desc" }, { tab: "users" }))).toBe("/x?tab=users");
    const filtered = parseTableQuery({ q: "a", sort: "name", dir: "asc", size: "50", status: "active", page: "3" }, spec);
    expect(tableParams(filtered, { sort: "created", dir: "desc" }).toString()).toBe("q=a&sort=name&dir=asc&size=50&status=active&page=3");
  });

  it("searches, filters, sorts and clamps the page", () => {
    const rows = [{ n: "Bo", s: "active" }, { n: "Al", s: "disabled" }, { n: "Cy", s: "active" }];
    const options = { search: (row: (typeof rows)[number]) => row.n, sortKey: (row: (typeof rows)[number]) => row.n, filter: (row: (typeof rows)[number], _: string, value: string) => row.s === value };
    const result = applyTableQuery(rows, parseTableQuery({ sort: "name", dir: "asc", status: "active", page: "9", size: "10" }, spec), options);
    expect(result).toMatchObject({ total: 2, page: 1 });
    expect(result.rows.map((row) => row.n)).toEqual(["Bo", "Cy"]);
    expect(applyTableQuery(rows, parseTableQuery({ q: "al" }, spec), options).rows).toHaveLength(1);
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(101, 25)).toBe(5);
  });
});

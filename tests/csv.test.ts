import { describe, expect, it } from "vitest";
import { csvField } from "../lib/csv";

describe("csvField", () => {
  it("quotes values and doubles embedded quotes", () => {
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
  });

  it("neutralizes spreadsheet formulas", () => {
    for (const formula of ["=SUM(A1)", "+1", "-1", "@cmd", "\tx"]) {
      expect(csvField(formula)).toBe(`"'${formula}"`);
    }
  });

  it("serializes objects, dates, and empty values", () => {
    expect(csvField({ a: 1 })).toBe('"{""a"":1}"');
    expect(csvField(new Date("2026-01-01T00:00:00.000Z"))).toBe('"2026-01-01T00:00:00.000Z"');
    expect(csvField(null)).toBe('""');
    expect(csvField(false)).toBe('"false"');
  });
});

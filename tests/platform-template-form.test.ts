import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("platform monitor-template form", () => {
  it("accepts a three-digit HTTP status range in native browser validation", () => {
    const source = readFileSync(
      "app/platform/(protected)/templates/page.tsx",
      "utf8"
    );

    expect(source).toContain('pattern="[0-9]{3}-[0-9]{3}"');
    expect(source).not.toContain('pattern="\\\\d{3}-\\\\d{3}"');
  });
});

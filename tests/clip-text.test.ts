import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgresql://signalhub:signalhub@127.0.0.1:5432/status_unit_tests";

const { clipText } = await import("../lib/notification-providers");

describe("clipText", () => {
  it("leaves messages inside the limit alone", () => {
    expect(clipText("short", 10)).toBe("short");
    expect(clipText("exactly10!", 10)).toBe("exactly10!");
  });

  it("cuts to exactly the limit and marks the cut", () => {
    const clipped = clipText("a".repeat(5_000), 2_000);
    expect(clipped).toHaveLength(2_000);
    expect(clipped.endsWith("…")).toBe(true);
  });

  it("never returns more than the limit, even for tiny limits", () => {
    expect(clipText("abcdef", 3)).toBe("ab…");
    expect(clipText("abcdef", 1)).toBe("…");
  });
});

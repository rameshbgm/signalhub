import { describe, expect, it } from "vitest";
import { calculateSelectMenuLayout } from "@/components/FluentSelect";

describe("calculateSelectMenuLayout", () => {
  it("matches a wide trigger instead of capping the popup", () => {
    const layout = calculateSelectMenuLayout({
      contentWidth: 120,
      optionCount: 3,
      trigger: { bottom: 498, left: 41, right: 881, top: 472, width: 840 },
      viewportHeight: 900,
      viewportWidth: 1440,
    });

    expect(layout.position.width).toBe(840);
    expect(layout.position.left).toBe(41);
    expect(layout.placement).toBe("below");
  });

  it("grows for long content while staying inside a phone viewport", () => {
    const layout = calculateSelectMenuLayout({
      contentWidth: 340,
      optionCount: 3,
      trigger: { bottom: 444, left: 37, right: 353, top: 400, width: 316 },
      viewportHeight: 844,
      viewportWidth: 390,
    });

    expect(layout.position.width).toBe(340);
    expect(layout.position.left).toBe(37);
    expect(Number(layout.position.left) + layout.position.width).toBeLessThanOrEqual(382);
  });

  it("flips above and constrains height when there is not enough room below", () => {
    const layout = calculateSelectMenuLayout({
      contentWidth: 220,
      optionCount: 20,
      trigger: { bottom: 744, left: 100, right: 320, top: 700, width: 220 },
      viewportHeight: 800,
      viewportWidth: 430,
    });

    expect(layout.placement).toBe("above");
    expect(layout.position.bottom).toBe(106);
    expect(layout.position.maxHeight).toBe(320);
  });
});

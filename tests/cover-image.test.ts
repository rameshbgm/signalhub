import { describe, expect, it } from "vitest";
import {
  bannerCropFromDrag,
  coverImageStyle,
  defaultBannerCrop,
  normalizedCoverImageSettings,
} from "@/lib/cover-image";

describe("cover image framing", () => {
  it("defaults to showing the complete image", () => {
    const settings = normalizedCoverImageSettings();
    expect(settings).toEqual({ fit: "CONTAIN", positionX: 50, positionY: 50 });
    expect(coverImageStyle("/cover.webp").backgroundSize).toBe("contain, cover, cover");
    expect(coverImageStyle("/cover.webp").backgroundPosition).toBe("center, center, center");
  });

  it("applies a selected crop focal point", () => {
    const style = coverImageStyle("/cover.webp", {
      fit: "COVER",
      positionX: 25,
      positionY: 80,
    });
    expect(style.backgroundSize).toBe("cover");
    expect(style.backgroundPosition).toBe("25% 80%");
  });

  it("maps a saved crop frame to the full banner background", () => {
    const style = coverImageStyle("/cover.webp", {
      fit: "COVER",
      cropX: 0,
      cropY: 25,
      cropWidth: 100,
      cropHeight: 50,
    });
    expect(style.backgroundSize).toBe("100% 200%");
    expect(style.backgroundPosition).toBe("50% 50%");
  });

  it("creates and redraws a 16:5 crop frame", () => {
    expect(defaultBannerCrop(1536, 1024)).toMatchObject({ x: 0, width: 100 });
    const crop = bannerCropFromDrag(100, 100, 900, 500, 1000, 700);
    expect(crop).not.toBeNull();
    expect((crop!.width / 100 * 1000) / (crop!.height / 100 * 700)).toBeCloseTo(16 / 5);
  });

  it("keeps overlays independent from image fitting", () => {
    const style = coverImageStyle(
      "/cover.webp",
      { fit: "CONTAIN", positionX: 10, positionY: 90 },
      "linear-gradient(#0008, #0008)"
    );
    expect(style.backgroundSize).toBe("cover, contain, cover");
    expect(style.backgroundPosition).toBe("center, center, center");
    expect(style.backgroundRepeat).toBe("no-repeat, no-repeat, no-repeat");
  });

  it("clamps invalid coordinates to the visible range", () => {
    expect(normalizedCoverImageSettings({ positionX: -20, positionY: 180 })).toMatchObject({
      positionX: 0,
      positionY: 100,
    });
  });
});

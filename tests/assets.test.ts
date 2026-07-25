import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { normalizeAsset } from "../lib/assets";
import { assetStorageForDriver } from "../lib/asset-storage";

describe("managed image assets", () => {
  it("preserves a wide logo aspect ratio while normalizing it", async () => {
    const source = await sharp({
      create: {
        width: 1200,
        height: 240,
        channels: 4,
        background: "#19a6b4",
      },
    }).png().toBuffer();
    const file = new File([source], "wide-logo.png", { type: "image/png" });
    const normalized = await normalizeAsset(file, "LOGO");

    expect(normalized.mimeType).toBe("image/webp");
    expect(normalized.width).toBe(1200);
    expect(normalized.height).toBe(240);
  });

  it("rejects executable vector uploads", async () => {
    const file = new File(["<svg><script>alert(1)</script></svg>"], "unsafe.svg", {
      type: "image/svg+xml",
    });
    await expect(normalizeAsset(file, "LOGO")).rejects.toThrow("Use a PNG");
  });

  it("fails closed when a stored asset has no recognized backend", () => {
    expect(() => assetStorageForDriver(undefined)).toThrow(
      "Asset storage driver is missing or unsupported"
    );
    expect(() => assetStorageForDriver("filesystem")).toThrow(
      "Asset storage driver is missing or unsupported"
    );
  });
});

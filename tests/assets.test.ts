import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { AssetValidationError, normalizeAsset } from "../lib/assets";
import { assetStorageForDriver, flushAssetCache, readImageCached } from "../lib/asset-storage";

vi.mock("@/lib/postgres/client", () => ({ database: {} }));

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

  it("rejects corrupt images, mislabeled vectors, and oversized decoded images as validation errors", async () => {
    const tooLarge = await sharp({ create: { width: 6001, height: 1, channels: 3, background: "white" } }).png().toBuffer();
    for (const data of [Buffer.from("not an image"), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" /></svg>'), tooLarge]) {
      await expect(normalizeAsset(new File([data], "image.png", { type: "image/png" }), "LOGO"))
        .rejects.toBeInstanceOf(AssetValidationError);
    }
  });

  it("validates ICO directories and retains valid PNG-backed favicons", async () => {
    const png = await sharp({ create: { width: 16, height: 16, channels: 4, background: "white" } }).png().toBuffer();
    const directory = Buffer.alloc(22);
    directory.writeUInt16LE(1, 2); directory.writeUInt16LE(1, 4);
    directory[6] = 16; directory[7] = 16;
    directory.writeUInt16LE(1, 10); directory.writeUInt16LE(32, 12);
    directory.writeUInt32LE(png.length, 14); directory.writeUInt32LE(22, 18);
    const icon = Buffer.concat([directory, png]);
    const normalized = await normalizeAsset(new File([icon], "favicon.ico", { type: "image/x-icon" }), "FAVICON");
    expect(normalized.bytes).toEqual(icon);
    const invalidOffset = Buffer.from(icon); invalidOffset.writeUInt32LE(icon.length + 1, 18);
    for (const data of [Buffer.from("<html>not an ICO</html>"), icon.subarray(0, 15), invalidOffset]) {
      await expect(normalizeAsset(new File([data], "favicon.ico", { type: "image/x-icon" }), "FAVICON"))
        .rejects.toBeInstanceOf(AssetValidationError);
    }
  });

  it("fails closed when a stored asset has no recognized backend", () => {
    expect(() => assetStorageForDriver(undefined)).toThrow(
      "Asset storage driver is missing or unsupported"
    );
    expect(() => assetStorageForDriver("filesystem")).toThrow(
      "Asset storage driver is missing or unsupported"
    );
  });

  it("serves repeat image reads from memory until the key is flushed", async () => {
    const storage = assetStorageForDriver("DB");
    let reads = 0;
    storage.get = async () => (reads++, Buffer.from("img"));
    await readImageCached("DB", "k/1.webp");
    await readImageCached("DB", "k/1.webp");
    expect(reads).toBe(1);
    flushAssetCache("k/1.webp");
    await readImageCached("DB", "k/1.webp");
    expect(reads).toBe(2);
    flushAssetCache();
  });
});

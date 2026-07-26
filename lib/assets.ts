import sharp from "sharp";

const ASSET_LIMITS = {
  LOGO: 2 * 1024 * 1024,
  FAVICON: 512 * 1024,
  COVER: 5 * 1024 * 1024,
} as const;

export type AssetKind = keyof typeof ASSET_LIMITS;

export class AssetValidationError extends Error {}

const ALLOWED = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

export async function normalizeAsset(file: File, kind: AssetKind) {
  if (!ALLOWED.has(file.type)) {
    throw new AssetValidationError("Use a PNG, JPEG, WebP, AVIF, or ICO image");
  }
  if (file.size <= 0 || file.size > ASSET_LIMITS[kind]) {
    throw new AssetValidationError(
      `${kind.toLowerCase()} files must be smaller than ${Math.round(ASSET_LIMITS[kind] / 1024 / 1024 * 10) / 10} MB`
    );
  }
  const input = Buffer.from(await file.arrayBuffer());
  if (file.type.includes("icon")) {
    if (kind !== "FAVICON") throw new AssetValidationError("ICO files can only be used as favicons");
    return {
      bytes: input,
      mimeType: "image/x-icon",
      extension: "ico",
      width: null,
      height: null,
    };
  }
  const image = sharp(input, { failOn: "warning" }).rotate();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new AssetValidationError("Image dimensions could not be read");
  if (metadata.width > 6000 || metadata.height > 6000) {
    throw new AssetValidationError("Image dimensions may not exceed 6000×6000 pixels");
  }
  const maxWidth = kind === "COVER" ? 2400 : kind === "LOGO" ? 1600 : 256;
  const maxHeight = kind === "COVER" ? 1400 : kind === "LOGO" ? 800 : 256;
  const bytes = await image
    .resize({ width: maxWidth, height: maxHeight, fit: "inside", withoutEnlargement: true })
    .webp({ quality: kind === "FAVICON" ? 90 : 86 })
    .toBuffer();
  const outputMetadata = await sharp(bytes).metadata();
  return {
    bytes,
    mimeType: "image/webp",
    extension: "webp",
    width: outputMetadata.width ?? metadata.width,
    height: outputMetadata.height ?? metadata.height,
  };
}

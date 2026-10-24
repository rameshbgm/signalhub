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

/** ICO is retained as a container; validate its directory instead of trusting its MIME label. */
function validateIcon(input: Buffer) {
  if (input.length < 6 || input.readUInt16LE(0) !== 0 || input.readUInt16LE(2) !== 1) {
    throw new AssetValidationError("Choose a valid ICO image");
  }
  const count = input.readUInt16LE(4);
  const directoryEnd = 6 + count * 16;
  if (!count || directoryEnd > input.length) throw new AssetValidationError("ICO image directory is invalid");
  for (let index = 0; index < count; index++) {
    const entry = 6 + index * 16;
    const size = input.readUInt32LE(entry + 8);
    const offset = input.readUInt32LE(entry + 12);
    if (input[entry + 3] !== 0 || size < 12 || offset < directoryEnd || offset + size > input.length) {
      throw new AssetValidationError("ICO image data is invalid");
    }
    const png = input.subarray(offset, offset + 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const dibSize = input.readUInt32LE(offset);
    if (!png && (![12, 40, 108, 124].includes(dibSize) || dibSize > size)) {
      throw new AssetValidationError("ICO must contain PNG or bitmap images");
    }
  }
}

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
    validateIcon(input);
    return {
      bytes: input,
      mimeType: "image/x-icon",
      extension: "ico",
      width: null,
      height: null,
    };
  }
  try {
    const image = sharp(input, { failOn: "warning", limitInputPixels: 6000 * 6000 }).rotate();
    const metadata = await image.metadata();
    // A client-supplied MIME label must not allow SVG or other decoder formats.
    if (!["png", "jpeg", "webp", "heif"].includes(metadata.format ?? "")) {
      throw new AssetValidationError("Use a PNG, JPEG, WebP, or AVIF image");
    }
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
  } catch (error) {
    if (error instanceof AssetValidationError) throw error;
    throw new AssetValidationError("Image data is invalid or exceeds the supported dimensions");
  }
}

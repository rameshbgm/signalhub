import type { CSSProperties } from "react";

export type CoverImageFit = "COVER" | "CONTAIN";

export type CoverImageSettings = {
  fit?: CoverImageFit | null;
  positionX?: number | null;
  positionY?: number | null;
  cropX?: number | null;
  cropY?: number | null;
  cropWidth?: number | null;
  cropHeight?: number | null;
};

export type CoverImageCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const DEFAULT_COVER_IMAGE_SETTINGS = {
  fit: "CONTAIN" as const,
  positionX: 50,
  positionY: 50,
  cropX: null,
  cropY: null,
  cropWidth: null,
  cropHeight: null,
};

function coordinate(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

export function normalizedCoverImageSettings(settings: CoverImageSettings = {}) {
  return {
    fit: settings.fit === "COVER" ? "COVER" as const : "CONTAIN" as const,
    positionX: coordinate(settings.positionX),
    positionY: coordinate(settings.positionY),
  };
}

export function normalizedCoverImageCrop(settings: CoverImageSettings = {}): CoverImageCrop | null {
  const values = [settings.cropX, settings.cropY, settings.cropWidth, settings.cropHeight].map(Number);
  if (values.some((value) => !Number.isFinite(value))) return null;
  const [rawX, rawY, rawWidth, rawHeight] = values;
  if (rawWidth <= 0 || rawHeight <= 0) return null;
  const width = Math.min(100, Math.max(1, rawWidth));
  const height = Math.min(100, Math.max(1, rawHeight));
  return {
    x: Math.min(100 - width, Math.max(0, rawX)),
    y: Math.min(100 - height, Math.max(0, rawY)),
    width,
    height,
  };
}

export function defaultBannerCrop(imageWidth: number, imageHeight: number): CoverImageCrop {
  const sourceAspect = imageWidth > 0 && imageHeight > 0 ? imageWidth / imageHeight : 16 / 5;
  const bannerAspect = 16 / 5;
  if (sourceAspect > bannerAspect) {
    const width = (bannerAspect / sourceAspect) * 100;
    return { x: (100 - width) / 2, y: 0, width, height: 100 };
  }
  const height = (sourceAspect / bannerAspect) * 100;
  return { x: 0, y: (100 - height) / 2, width: 100, height };
}

export function bannerCropFromDrag(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  imageWidth: number,
  imageHeight: number,
): CoverImageCrop | null {
  if (imageWidth <= 0 || imageHeight <= 0) return null;
  const originX = Math.min(imageWidth, Math.max(0, startX));
  const originY = Math.min(imageHeight, Math.max(0, startY));
  const targetX = Math.min(imageWidth, Math.max(0, endX));
  const targetY = Math.min(imageHeight, Math.max(0, endY));
  const directionX = targetX >= originX ? 1 : -1;
  const directionY = targetY >= originY ? 1 : -1;
  let width = Math.abs(targetX - originX);
  let height = Math.abs(targetY - originY);
  if (width < 4 && height < 4) return null;
  const bannerAspect = 16 / 5;
  if (width / Math.max(height, 1) > bannerAspect) height = width / bannerAspect;
  else width = height * bannerAspect;
  width = Math.min(width, directionX > 0 ? imageWidth - originX : originX);
  height = width / bannerAspect;
  if (height > (directionY > 0 ? imageHeight - originY : originY)) {
    height = directionY > 0 ? imageHeight - originY : originY;
    width = height * bannerAspect;
  }
  if (width < 4 || height < 2) return null;
  const left = directionX > 0 ? originX : originX - width;
  const top = directionY > 0 ? originY : originY - height;
  return {
    x: (left / imageWidth) * 100,
    y: (top / imageHeight) * 100,
    width: (width / imageWidth) * 100,
    height: (height / imageHeight) * 100,
  };
}

export function coverImageStyle(
  imageUrl: string,
  settings: CoverImageSettings = {},
  overlay?: string
): CSSProperties {
  const normalized = normalizedCoverImageSettings(settings);
  const image = `url(${JSON.stringify(imageUrl)})`;

  if (normalized.fit === "CONTAIN") {
    const backdropShade = "linear-gradient(rgba(15,23,42,0.72),rgba(15,23,42,0.72))";
    return {
      backgroundImage: overlay
        ? `${overlay}, ${image}, ${image}`
        : `${image}, ${backdropShade}, ${image}`,
      backgroundPosition: "center, center, center",
      backgroundRepeat: "no-repeat, no-repeat, no-repeat",
      backgroundSize: overlay ? "cover, contain, cover" : "contain, cover, cover",
    };
  }

  const crop = normalizedCoverImageCrop(settings);
  if (crop) {
    const positionX = crop.width >= 100 ? 50 : (crop.x / (100 - crop.width)) * 100;
    const positionY = crop.height >= 100 ? 50 : (crop.y / (100 - crop.height)) * 100;
    const cropSize = `${10000 / crop.width}% ${10000 / crop.height}%`;
    const cropPosition = `${positionX}% ${positionY}%`;
    return {
      backgroundImage: overlay ? `${overlay}, ${image}` : image,
      backgroundPosition: overlay ? `center, ${cropPosition}` : cropPosition,
      backgroundRepeat: overlay ? "no-repeat, no-repeat" : "no-repeat",
      backgroundSize: overlay ? `cover, ${cropSize}` : cropSize,
    };
  }

  const imagePosition = `${normalized.positionX}% ${normalized.positionY}%`;
  return {
    backgroundImage: overlay ? `${overlay}, ${image}` : image,
    backgroundPosition: overlay ? `center, ${imagePosition}` : imagePosition,
    backgroundRepeat: overlay ? "no-repeat, no-repeat" : "no-repeat",
    backgroundSize: overlay ? "cover, cover" : "cover",
  };
}

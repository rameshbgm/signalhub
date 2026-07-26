"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import {
  bannerCropFromDrag,
  coverImageStyle,
  defaultBannerCrop,
  normalizedCoverImageCrop,
  normalizedCoverImageSettings,
  type CoverImageCrop,
  type CoverImageFit,
} from "@/lib/cover-image";

export function AssetUploader({
  pageId,
  kind,
  currentUrl,
  label,
  help,
  currentCoverFit,
  currentCoverPositionX,
  currentCoverPositionY,
  currentCoverCropX,
  currentCoverCropY,
  currentCoverCropWidth,
  currentCoverCropHeight,
}: {
  pageId: string;
  kind: "LOGO" | "FAVICON" | "COVER";
  currentUrl?: string | null;
  label: string;
  help: string;
  currentCoverFit?: CoverImageFit | null;
  currentCoverPositionX?: number | null;
  currentCoverPositionY?: number | null;
  currentCoverCropX?: number | null;
  currentCoverCropY?: number | null;
  currentCoverCropWidth?: number | null;
  currentCoverCropHeight?: number | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);
  const [preview, setPreview] = useState(currentUrl ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingFraming, setSavingFraming] = useState(false);
  const initialCover = normalizedCoverImageSettings({
    fit: currentCoverFit,
    positionX: currentCoverPositionX,
    positionY: currentCoverPositionY,
  });
  const [coverFit, setCoverFit] = useState<CoverImageFit>(initialCover.fit);
  const [coverPositionX, setCoverPositionX] = useState(initialCover.positionX);
  const [coverPositionY, setCoverPositionY] = useState(initialCover.positionY);
  const [coverCrop, setCoverCrop] = useState<CoverImageCrop | null>(() => normalizedCoverImageCrop({
    cropX: currentCoverCropX,
    cropY: currentCoverCropY,
    cropWidth: currentCoverCropWidth,
    cropHeight: currentCoverCropHeight,
  }));
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const isCover = kind === "COVER";
  const busy = loading || savingFraming;

  async function upload(file: File) {
    if (loading) return;
    setLoading(true);
    setMessageIsError(false);
    setMessage(null);
    const body = new FormData();
    body.set("kind", kind);
    body.set("file", file);

    try {
      const response = await fetchWithTimeout(
        `/api/admin/pages/${pageId}/assets`,
        { method: "POST", body },
        60_000
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPreview(preview);
        setMessageIsError(true);
        setMessage(data.error?.message ?? "Upload failed");
        return;
      }
      setPreview(data.asset.url);
      if (isCover) {
        const cover = normalizedCoverImageSettings(data.asset.cover);
        setCoverFit(cover.fit);
        setCoverPositionX(cover.positionX);
        setCoverPositionY(cover.positionY);
        setCoverCrop(null);
      }
      router.refresh();
      setMessage(
        data.asset.width && data.asset.height
          ? `Saved at ${data.asset.width}×${data.asset.height}px`
          : "Saved"
      );
    } catch {
      setPreview(preview);
      setMessageIsError(true);
      setMessage("Unable to upload the image. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function remove() {
    if (loading) return;
    setLoading(true);
    setMessageIsError(false);
    setMessage(null);

    try {
      const response = await fetchWithTimeout(`/api/admin/pages/${pageId}/assets?kind=${kind}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessageIsError(true);
        setMessage(data.error?.message ?? "Image could not be removed");
        return;
      }
      setPreview("");
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
      setMessage("Image removed");
    } catch {
      setMessageIsError(true);
      setMessage("Unable to remove the image. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function saveFraming() {
    if (!isCover || !preview || busy) return;
    setSavingFraming(true);
    setMessageIsError(false);
    setMessage(null);
    try {
      const response = await fetchWithTimeout(`/api/admin/pages/${pageId}/assets`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fit: coverFit,
          positionX: coverPositionX,
          positionY: coverPositionY,
          cropX: coverCrop?.x ?? null,
          cropY: coverCrop?.y ?? null,
          cropWidth: coverCrop?.width ?? null,
          cropHeight: coverCrop?.height ?? null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessageIsError(true);
        setMessage(data.error?.message ?? "Cover framing could not be saved");
        return;
      }
      router.refresh();
      setMessage("Cover framing saved and published");
    } catch {
      setMessageIsError(true);
      setMessage("Unable to save the cover framing. Check your connection and try again.");
    } finally {
      setSavingFraming(false);
    }
  }

  function cropPoint(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      width: bounds.width,
      height: bounds.height,
    };
  }

  function startCrop(event: ReactPointerEvent<HTMLDivElement>) {
    if (coverFit !== "COVER" || busy) return;
    const point = cropPoint(event);
    cropStartRef.current = { x: point.x, y: point.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateCrop(event: ReactPointerEvent<HTMLDivElement>) {
    const start = cropStartRef.current;
    if (!start || coverFit !== "COVER") return;
    const point = cropPoint(event);
    const crop = bannerCropFromDrag(start.x, start.y, point.x, point.y, point.width, point.height);
    if (crop) setCoverCrop(crop);
  }

  function finishCrop(event: ReactPointerEvent<HTMLDivElement>) {
    updateCrop(event);
    cropStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div className={`space-y-3 border border-[var(--line)] bg-[var(--surface)] p-4 ${isCover ? "sm:col-span-full" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--fg)]">{label}</p>
          <p className="mt-0.5 text-xs text-[var(--fg-dim)]">{help}</p>
        </div>
        {preview && !isCover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt=""
            className="h-14 w-28 shrink-0 border border-[var(--line)] bg-[var(--bg)] object-contain p-2"
          />
        ) : !isCover ? (
          <div className="flex h-14 w-28 items-center justify-center border border-dashed border-[var(--line)] text-xs text-[var(--fg-dim)]">
            No image
          </div>
        ) : null}
      </div>
      {isCover && (
        preview ? (
          <div className="space-y-3">
            <div className="flex max-h-[32rem] justify-center overflow-hidden border border-[var(--line)] bg-[var(--bg)] p-2">
              <div
                className={`relative inline-block max-h-[30rem] max-w-full select-none overflow-hidden touch-none ${coverFit === "COVER" ? "cursor-crosshair" : ""}`}
                onPointerDown={startCrop}
                onPointerMove={updateCrop}
                onPointerUp={finishCrop}
                onPointerCancel={finishCrop}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Full cover image crop source"
                  draggable={false}
                  className="block max-h-[30rem] max-w-full object-contain"
                  onLoad={(event) => {
                    const dimensions = {
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    };
                    setImageDimensions(dimensions);
                    setCoverCrop((current) => current ?? defaultBannerCrop(dimensions.width, dimensions.height));
                  }}
                />
                {coverFit === "COVER" && coverCrop && (
                  <span
                    aria-label="Selected banner crop"
                    className="pointer-events-none absolute border-2 border-white shadow-[0_0_0_9999px_rgba(15,23,42,0.62)]"
                    style={{
                      left: `${coverCrop.x}%`,
                      top: `${coverCrop.y}%`,
                      width: `${coverCrop.width}%`,
                      height: `${coverCrop.height}%`,
                    }}
                  >
                    <span className="absolute inset-0 border border-black/30" />
                  </span>
                )}
              </div>
            </div>
            {coverFit === "COVER" && coverCrop && (
              <div>
                <p className="mb-1 text-xs font-medium text-[var(--fg-soft)]">Published banner preview</p>
                <div
                  role="img"
                  aria-label="Selected cover banner preview"
                  className="aspect-[16/5] w-full border border-[var(--line)] bg-[var(--bg)]"
                  style={coverImageStyle(preview, {
                    fit: "COVER",
                    cropX: coverCrop.x,
                    cropY: coverCrop.y,
                    cropWidth: coverCrop.width,
                    cropHeight: coverCrop.height,
                  })}
                />
              </div>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <label className="text-xs text-[var(--fg-soft)]">
                Image display
                <select
                  value={coverFit}
                  onChange={(event) => {
                    const fit = event.target.value as CoverImageFit;
                    setCoverFit(fit);
                    if (fit === "COVER" && !coverCrop && imageDimensions.width > 0) {
                      setCoverCrop(defaultBannerCrop(imageDimensions.width, imageDimensions.height));
                    }
                  }}
                  disabled={busy}
                  className="mt-1 min-w-52 border border-[var(--line)] bg-[var(--bg)] px-2 py-2 text-sm text-[var(--fg)]"
                >
                  <option value="CONTAIN">Show full image</option>
                  <option value="COVER">Fill frame (crop)</option>
                </select>
              </label>
              {coverFit === "COVER" && imageDimensions.width > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setCoverCrop(defaultBannerCrop(imageDimensions.width, imageDimensions.height))}
                  className="w-fit border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--fg-soft)] disabled:opacity-50"
                >
                  Reset crop
                </button>
              )}
            </div>
            <p className="text-xs text-[var(--fg-dim)]">
              {coverFit === "COVER"
                ? "Drag anywhere across the full image to draw a new banner frame. The selection keeps the public banner’s 16:5 shape."
                : "The public page shows the complete image without cropping and caps its height responsively."}
            </p>
          </div>
        ) : (
          <div className="flex aspect-[16/5] w-full items-center justify-center border border-dashed border-[var(--line)] text-xs text-[var(--fg-dim)]">
            No cover image
          </div>
        )
      )}
      <input
        ref={inputRef}
        type="file"
        accept={kind === "FAVICON" ? "image/png,image/webp,image/x-icon" : "image/png,image/jpeg,image/webp,image/avif"}
        className="block w-full text-xs text-[var(--fg-soft)] file:mr-3 file:border file:border-[var(--line)] file:bg-[var(--surface-raised)] file:px-3 file:py-2 file:text-xs file:text-[var(--fg)]"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            const localPreview = URL.createObjectURL(file);
            setPreview(localPreview);
            void upload(file).finally(() => URL.revokeObjectURL(localPreview));
          }
        }}
      />
      {preview && (
        <div className="flex flex-wrap gap-2">
          {isCover && (
            <button type="button" disabled={busy} onClick={() => void saveFraming()} className="border border-[var(--cyan)] px-3 py-1.5 text-xs font-semibold text-[var(--cyan)] disabled:opacity-50">
              {savingFraming ? "Saving framing…" : "Save cover framing"}
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="border border-[var(--red)]/30 px-3 py-1.5 text-xs font-semibold text-[var(--red)] disabled:opacity-50"
          >
            Remove image
          </button>
        </div>
      )}
      {message && (
        <p
          role={messageIsError ? "alert" : "status"}
          className={`text-xs ${messageIsError ? "text-[var(--red)]" : "text-[var(--fg-soft)]"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}

"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";

import { useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ImageIcon, Loader2, Maximize2, Trash2, Upload, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  bannerCropFromDrag,
  coverImageStyle,
  defaultBannerCrop,
  movedBannerCrop,
  normalizedCoverImageCrop,
  normalizedCoverImageSettings,
  type CoverImageCrop,
  type CoverImageFit,
} from "@/lib/cover-image";

type CropHandle = "nw" | "ne" | "sw" | "se";

type CropInteraction =
  | { mode: "draw"; startX: number; startY: number }
  | { mode: "move"; startX: number; startY: number; initial: CoverImageCrop }
  | { mode: "resize"; anchorX: number; anchorY: number };

const CROP_HANDLES: Array<{ handle: CropHandle; className: string }> = [
  { handle: "nw", className: "-left-2 -top-2 cursor-nwse-resize" },
  { handle: "ne", className: "-right-2 -top-2 cursor-nesw-resize" },
  { handle: "sw", className: "-bottom-2 -left-2 cursor-nesw-resize" },
  { handle: "se", className: "-bottom-2 -right-2 cursor-nwse-resize" },
];

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
  staged = false,
  simple = false,
  onStagedChange,
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
  staged?: boolean;
  simple?: boolean;
  onStagedChange?: (value: {
    url: string | null;
    cover?: { fit: CoverImageFit; positionX: number; positionY: number; crop: CoverImageCrop | null };
  }) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const fitId = useId();
  const cropInteractionRef = useRef<CropInteraction | null>(null);
  const [preview, setPreview] = useState(currentUrl ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingFraming, setSavingFraming] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
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
        `/api/admin/pages/${pageId}/assets${staged ? "?stage=1" : ""}`,
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
        onStagedChange?.({ url: data.asset.url, cover: { fit: cover.fit, positionX: cover.positionX, positionY: cover.positionY, crop: null } });
      } else {
        onStagedChange?.({ url: data.asset.url });
      }
      if (!staged) router.refresh();
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
    if (staged) {
      setPreview("");
      if (inputRef.current) inputRef.current.value = "";
      onStagedChange?.({ url: null });
      setMessage("Removed from draft");
      return;
    }
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
    if (staged) {
      onStagedChange?.({ url: preview, cover: { fit: coverFit, positionX: coverPositionX, positionY: coverPositionY, crop: coverCrop } });
      setMessage("Cover framing saved to draft");
      return;
    }
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
    const target = event.target as HTMLElement;
    const handle = target.closest<HTMLElement>("[data-crop-handle]")?.dataset.cropHandle as CropHandle | undefined;
    if (handle && coverCrop) {
      const left = (coverCrop.x / 100) * point.width;
      const top = (coverCrop.y / 100) * point.height;
      const right = left + (coverCrop.width / 100) * point.width;
      const bottom = top + (coverCrop.height / 100) * point.height;
      cropInteractionRef.current = {
        mode: "resize",
        anchorX: handle === "nw" || handle === "sw" ? right : left,
        anchorY: handle === "nw" || handle === "ne" ? bottom : top,
      };
    } else if (target.closest("[data-crop-selection]") && coverCrop) {
      cropInteractionRef.current = {
        mode: "move",
        startX: point.x,
        startY: point.y,
        initial: coverCrop,
      };
    } else {
      cropInteractionRef.current = { mode: "draw", startX: point.x, startY: point.y };
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateCrop(event: ReactPointerEvent<HTMLDivElement>) {
    const interaction = cropInteractionRef.current;
    if (!interaction || coverFit !== "COVER") return;
    const point = cropPoint(event);
    if (interaction.mode === "move") {
      setCoverCrop(movedBannerCrop(
        interaction.initial,
        ((point.x - interaction.startX) / point.width) * 100,
        ((point.y - interaction.startY) / point.height) * 100,
      ));
      return;
    }
    const startX = interaction.mode === "resize" ? interaction.anchorX : interaction.startX;
    const startY = interaction.mode === "resize" ? interaction.anchorY : interaction.startY;
    const crop = bannerCropFromDrag(startX, startY, point.x, point.y, point.width, point.height);
    if (crop) setCoverCrop(crop);
  }

  function finishCrop(event: ReactPointerEvent<HTMLDivElement>) {
    updateCrop(event);
    cropInteractionRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  const accept = kind === "FAVICON" ? "image/png,image/webp,image/x-icon" : "image/png,image/jpeg,image/webp,image/avif";
  const formats = kind === "FAVICON" ? "PNG, WebP or ICO." : "PNG, JPEG, WebP or AVIF.";

  return (
    <div className="space-y-4 rounded-control border border-line bg-surface p-4">
      <div>
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="mt-0.5 text-xs leading-5 text-ink-dim">{help}</p>
      </div>
      {!isCover && (
        <div className="flex aspect-[16/5] w-full items-center justify-center overflow-hidden rounded-control bg-sunken">
          {preview ? (
            <button type="button" onClick={() => setPreviewOpen(true)} aria-label={`Preview ${label.toLowerCase()}`} title="Preview image" className="group relative grid h-full w-full place-items-center outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-primary/25">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt={`${label} preview`} className="h-full w-full object-contain p-4" />
              <span aria-hidden="true" className="absolute right-2 top-2 grid size-7 place-items-center text-ink-soft opacity-0 drop-shadow-[0_1px_1px_rgb(255_255_255)] transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                <Maximize2 size={14} />
              </span>
            </button>
          ) : (
            <span className="flex flex-col items-center gap-1 text-xs text-ink-dim"><ImageIcon aria-hidden="true" size={18} />No image</span>
          )}
        </div>
      )}
      {isCover && (
        preview ? (
          <div className="space-y-3">
            <div
              className={cn(
                "flex justify-center overflow-hidden rounded-control bg-sunken p-2",
                simple ? "aspect-[16/5] w-full cursor-zoom-in outline-none transition-opacity hover:opacity-85 focus-visible:ring-4 focus-visible:ring-primary/25" : "max-h-[32rem]",
              )}
              role={simple ? "button" : undefined}
              tabIndex={simple ? 0 : undefined}
              aria-label={simple ? "Preview cover image" : undefined}
              onClick={simple ? () => setPreviewOpen(true) : undefined}
              onKeyDown={simple ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPreviewOpen(true); } } : undefined}
            >
              <div
                className={cn(
                  "relative inline-block max-h-[30rem] max-w-full overflow-hidden",
                  simple ? "h-full w-full" : "touch-none select-none",
                  !simple && coverFit === "COVER" && "cursor-crosshair",
                )}
                onPointerDown={simple ? undefined : startCrop}
                onPointerMove={simple ? undefined : updateCrop}
                onPointerUp={simple ? undefined : finishCrop}
                onPointerCancel={simple ? undefined : finishCrop}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Full cover image crop source"
                  draggable={false}
                  className={simple ? "block h-full w-full object-contain" : "block max-h-[30rem] max-w-full object-contain"}
                  onLoad={(event) => {
                    const dimensions = {
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    };
                    setImageDimensions(dimensions);
                    setCoverCrop((current) => current ?? defaultBannerCrop(dimensions.width, dimensions.height));
                  }}
                />
                {!simple && coverFit === "COVER" && coverCrop && (
                  <span
                    data-crop-selection
                    role="group"
                    aria-label="Selected banner crop"
                    className="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(15,23,42,0.62)]"
                    style={{
                      left: `${coverCrop.x}%`,
                      top: `${coverCrop.y}%`,
                      width: `${coverCrop.width}%`,
                      height: `${coverCrop.height}%`,
                    }}
                  >
                    <span className="pointer-events-none absolute inset-0 border border-black/30" />
                    <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-chip bg-ink/70 px-2 py-1 text-2xs font-semibold text-white">
                      Drag to move
                    </span>
                    {CROP_HANDLES.map(({ handle, className }) => (
                      <span
                        key={handle}
                        data-crop-handle={handle}
                        aria-hidden="true"
                        className={cn("absolute size-4 rounded-chip border-2 border-white bg-primary shadow-card", className)}
                      />
                    ))}
                  </span>
                )}
              </div>
            </div>
            {!simple && coverFit === "COVER" && coverCrop && (
              <div>
                <p className="mb-1 text-xs font-medium text-ink-soft">Published banner preview</p>
                <div
                  role="img"
                  aria-label="Selected cover banner preview"
                  className="aspect-[16/5] w-full rounded-control bg-sunken"
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
            {simple ? (
              <p className="text-xs leading-5 text-ink-dim">New cover images are shown in full by default.</p>
            ) : (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <Field label="Image display" htmlFor={fitId} className="sm:min-w-52">
                    <Select
                      id={fitId}
                      value={coverFit}
                      onChange={(event) => {
                        const fit = event.target.value as CoverImageFit;
                        setCoverFit(fit);
                        if (fit === "COVER" && !coverCrop && imageDimensions.width > 0) {
                          setCoverCrop(defaultBannerCrop(imageDimensions.width, imageDimensions.height));
                        }
                      }}
                      disabled={busy}
                      className="w-full"
                    >
                      <option value="CONTAIN">Show full image</option>
                      <option value="COVER">Fill frame (crop)</option>
                    </Select>
                  </Field>
                  {coverFit === "COVER" && imageDimensions.width > 0 && (
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => setCoverCrop(defaultBannerCrop(imageDimensions.width, imageDimensions.height))}
                      variant="outline"
                      size="sm"
                      className="w-fit"
                    >
                      Reset crop
                    </Button>
                  )}
                </div>
                <p className="text-xs leading-5 text-ink-dim">
                  {coverFit === "COVER"
                    ? "Drag inside the frame to reposition it, drag a corner to resize it, or drag outside the frame to draw a new 16:5 banner selection."
                    : "The public page shows the complete image without cropping and caps its height responsively."}
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="flex aspect-[16/5] w-full flex-col items-center justify-center gap-1 rounded-control border border-dashed border-line-strong bg-sunken text-xs text-ink-dim">
            <ImageIcon aria-hidden="true" size={18} />
            No cover image
          </div>
        )
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "cursor-pointer focus-within:ring-4 focus-within:ring-primary/25", busy && "pointer-events-none opacity-50")}>
          {loading ? <Loader2 aria-hidden="true" size={16} className="animate-spin" /> : <Upload aria-hidden="true" size={16} />}
          <span>{loading ? "Uploading…" : preview ? "Replace image" : "Upload image"}</span>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="sr-only"
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
        </label>
        {preview && isCover && !simple && (
          <Button type="button" loading={savingFraming} disabled={loading} variant="outline" size="sm" onClick={() => void saveFraming()}>
            {savingFraming ? "Saving framing…" : "Save cover framing"}
          </Button>
        )}
        {preview && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="inline-flex min-h-8 items-center gap-2 rounded-control px-3 py-1.5 text-xs font-semibold text-danger-fg outline-none transition-colors duration-200 hover:bg-danger-bg focus-visible:ring-4 focus-visible:ring-danger/25 disabled:pointer-events-none disabled:opacity-50"
          >
            <Trash2 aria-hidden="true" size={16} />
            Remove image
          </button>
        )}
      </div>
      <p className="text-xs leading-5 text-ink-dim">{formats}</p>
      {message && (messageIsError
        ? <Alert tone="danger">{message}</Alert>
        : (
          <p role="status" className="flex items-center gap-1.5 text-xs text-ink-soft">
            <CheckCircle2 aria-hidden="true" size={14} className="shrink-0 text-ok" />
            {message}
          </p>
        ))}
      <Dialog open={previewOpen && Boolean(preview)} onOpenChange={(_event, data) => setPreviewOpen(data.open)}>
        <div role="dialog" aria-modal="true" aria-label={`${label} preview`} className="relative max-h-full max-w-5xl animate-pop overflow-auto rounded-sheet border border-line bg-surface p-3 shadow-float">
          <Button type="button" variant="secondary" size="icon" onClick={() => setPreviewOpen(false)} aria-label="Close image preview" title="Close preview" className="absolute right-5 top-5 z-10">
            <X aria-hidden size={16} />
          </Button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt={`${label} preview`} className={cn("max-h-[85vh] max-w-[min(90vw,72rem)] rounded-card object-contain", isCover ? "w-full" : "h-auto")} />
        </div>
      </Dialog>
    </div>
  );
}

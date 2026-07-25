"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function AssetUploader({
  pageId,
  kind,
  currentUrl,
  label,
  help,
}: {
  pageId: string;
  kind: "LOGO" | "FAVICON" | "COVER";
  currentUrl?: string | null;
  label: string;
  help: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(currentUrl ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function upload(file: File) {
    if (loading) return;
    setLoading(true);
    setMessageIsError(false);
    setMessage(null);
    const body = new FormData();
    body.set("kind", kind);
    body.set("file", file);

    try {
      const response = await fetch(`/api/admin/pages/${pageId}/assets`, {
        method: "POST",
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessageIsError(true);
        setMessage(data.error?.message ?? "Upload failed");
        return;
      }
      setPreview(data.asset.url);
      router.refresh();
      setMessage(
        data.asset.width && data.asset.height
          ? `Saved at ${data.asset.width}×${data.asset.height}px`
          : "Saved"
      );
    } catch {
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
      const response = await fetch(`/api/admin/pages/${pageId}/assets?kind=${kind}`, {
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

  return (
    <div className="space-y-2 border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--fg)]">{label}</p>
          <p className="mt-0.5 text-xs text-[var(--fg-dim)]">{help}</p>
        </div>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt=""
            className={`${kind === "COVER" ? "h-16 w-28" : "h-14 w-28"} shrink-0 border border-[var(--line)] bg-[var(--bg)] object-contain p-2`}
          />
        ) : (
          <div className="flex h-14 w-28 items-center justify-center border border-dashed border-[var(--line)] text-xs text-[var(--fg-dim)]">
            No image
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={kind === "FAVICON" ? "image/png,image/webp,image/x-icon" : "image/png,image/jpeg,image/webp,image/avif"}
        className="block w-full text-xs text-[var(--fg-soft)] file:mr-3 file:border file:border-[var(--line)] file:bg-[var(--surface-raised)] file:px-3 file:py-2 file:text-xs file:text-[var(--fg)]"
        disabled={loading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      {preview && (
        <button
          type="button"
          disabled={loading}
          onClick={() => void remove()}
          className="border border-[var(--red)]/30 px-3 py-1.5 text-xs font-semibold text-[var(--red)] disabled:opacity-50"
        >
          Remove image
        </button>
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

"use client";

import { useState } from "react";

export function LayoutPicker({ defaultValue, brandColor }: { defaultValue: string; brandColor: string }) {
  const [layout, setLayout] = useState(["COVER", "MINIMAL"].includes(defaultValue) ? defaultValue : "STANDARD");

  return (
    <div className="sm:col-span-2">
      <span className="mb-2 block text-xs text-[var(--fg-dim)]">Page layout</span>
      <div className="grid gap-4 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => setLayout("STANDARD")}
          className={`border p-1 text-left transition-colors ${layout === "STANDARD" ? "border-[var(--cyan)]" : "border-transparent"}`}
        >
          <div className="overflow-hidden border border-[var(--line)] bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
              <span className="text-[11px] font-semibold text-gray-800">ACME CO.</span>
              <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[9px] text-white">SUBSCRIBE</span>
            </div>
            <div className="px-3 py-1.5" style={{ backgroundColor: brandColor }}>
              <span className="text-[10px] font-medium text-white">All Systems Operational</span>
            </div>
            <div className="space-y-1 px-3 py-2">
              <div className="h-1.5 w-full rounded bg-gray-100" />
              <div className="h-1.5 w-2/3 rounded bg-gray-100" />
            </div>
          </div>
          <p className="mt-2 text-center text-xs font-medium text-[var(--fg)]">Standard layout</p>
          <p className="text-center text-[11px] text-[var(--fg-dim)]">Small logo at the top.</p>
        </button>

        <button
          type="button"
          onClick={() => setLayout("COVER")}
          className={`border p-1 text-left transition-colors ${layout === "COVER" ? "border-[var(--cyan)]" : "border-transparent"}`}
        >
          <div className="overflow-hidden border border-[var(--line)] bg-white">
            <div className="flex h-12 items-center justify-between bg-gray-900 px-3">
              <span className="text-[10px] font-medium text-white/90">OFFICIAL STATUS</span>
              <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[9px] text-white">SUBSCRIBE</span>
            </div>
            <div className="px-3 py-1.5" style={{ backgroundColor: brandColor }}>
              <span className="text-[10px] font-medium text-white">All Systems Operational</span>
            </div>
            <div className="space-y-1 px-3 py-2">
              <div className="h-1.5 w-full rounded bg-gray-100" />
              <div className="h-1.5 w-2/3 rounded bg-gray-100" />
            </div>
          </div>
          <p className="mt-2 text-center text-xs font-medium text-[var(--fg)]">Cover image</p>
          <p className="text-center text-[11px] text-[var(--fg-dim)]">Give your page some flair.</p>
        </button>

        <button
          type="button"
          onClick={() => setLayout("MINIMAL")}
          className={`border p-1 text-left transition-colors ${layout === "MINIMAL" ? "border-[var(--cyan)]" : "border-transparent"}`}
        >
          <div className="overflow-hidden border border-[var(--line)] bg-white">
            <div className="flex items-center justify-between border-b-2 px-3 py-1.5" style={{ borderColor: brandColor }}>
              <span className="text-[10px] font-semibold text-gray-800">Acme Co.</span>
            </div>
            <div className="space-y-1 px-3 py-2">
              <div className="h-1.5 w-full rounded bg-gray-100" />
              <div className="h-1.5 w-2/3 rounded bg-gray-100" />
            </div>
          </div>
          <p className="mt-2 text-center text-xs font-medium text-[var(--fg)]">Minimal</p>
          <p className="text-center text-[11px] text-[var(--fg-dim)]">Compact, embed-friendly.</p>
        </button>
      </div>
      <input type="hidden" name="layout" value={layout} />
    </div>
  );
}

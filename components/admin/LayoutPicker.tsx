"use client";

import { useState } from "react";

export function LayoutPicker({ defaultValue, brandColor }: { defaultValue: string; brandColor: string }) {
  const [layout, setLayout] = useState(defaultValue === "COVER" ? "COVER" : "STANDARD");

  return (
    <div className="sm:col-span-2">
      <span className="text-xs text-gray-500 block mb-2">Page layout</span>
      <div className="grid sm:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => setLayout("STANDARD")}
          className={`text-left rounded-lg border-2 p-1 transition-colors ${layout === "STANDARD" ? "border-blue-600" : "border-transparent"}`}
        >
          <div className="rounded-md border border-gray-200 overflow-hidden bg-white">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
              <span className="text-[11px] font-semibold text-gray-800">ACME CO.</span>
              <span className="text-[9px] rounded bg-blue-600 text-white px-1.5 py-0.5">SUBSCRIBE</span>
            </div>
            <div className="px-3 py-1.5" style={{ backgroundColor: brandColor }}>
              <span className="text-[10px] text-white font-medium">All Systems Operational</span>
            </div>
            <div className="px-3 py-2 space-y-1">
              <div className="h-1.5 bg-gray-100 rounded w-full" />
              <div className="h-1.5 bg-gray-100 rounded w-2/3" />
            </div>
          </div>
          <p className="text-center text-xs font-medium mt-2">Standard layout</p>
          <p className="text-center text-[11px] text-gray-400">Small logo at the top.</p>
        </button>

        <button
          type="button"
          onClick={() => setLayout("COVER")}
          className={`text-left rounded-lg border-2 p-1 transition-colors ${layout === "COVER" ? "border-blue-600" : "border-transparent"}`}
        >
          <div className="rounded-md border border-gray-200 overflow-hidden bg-white">
            <div className="h-12 bg-gray-900 flex items-center justify-between px-3">
              <span className="text-[10px] text-white/90 font-medium">OFFICIAL STATUS</span>
              <span className="text-[9px] rounded bg-blue-600 text-white px-1.5 py-0.5">SUBSCRIBE</span>
            </div>
            <div className="px-3 py-1.5" style={{ backgroundColor: brandColor }}>
              <span className="text-[10px] text-white font-medium">All Systems Operational</span>
            </div>
            <div className="px-3 py-2 space-y-1">
              <div className="h-1.5 bg-gray-100 rounded w-full" />
              <div className="h-1.5 bg-gray-100 rounded w-2/3" />
            </div>
          </div>
          <p className="text-center text-xs font-medium mt-2">Cover image</p>
          <p className="text-center text-[11px] text-gray-400">Give your page some flair.</p>
        </button>
      </div>
      <input type="hidden" name="layout" value={layout} />
    </div>
  );
}

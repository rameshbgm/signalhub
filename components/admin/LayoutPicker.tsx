"use client";

import { useRef, useState } from "react";
import {
  PAGE_TEMPLATE_KEYS,
  PAGE_TEMPLATE_LABELS,
  type PageTemplateKey,
} from "@/lib/page-design";

const DESCRIPTION: Record<PageTemplateKey, string> = {
  CENTERED_SUMMARY: "Centered status and a balanced two-column body.",
  BANNER_SPOTLIGHT: "A wide banner followed by a spacious status summary.",
  UPTIME_TIMELINE: "Prioritizes service uptime history and trends.",
  ILLUSTRATED_HERO: "A strong cover-image hero for branded pages.",
  GROUPED_DIRECTORY: "Searchable service groups for larger catalogs.",
  PRODUCT_GRID: "Card-based products and services at a glance.",
  DENSE_OPERATIONS: "Compact, dark operations-focused presentation.",
  MINIMAL_ENTERPRISE: "Restrained chrome with a compact content flow.",
};

export function LayoutPicker({ defaultValue, brandColor }: { defaultValue: string; brandColor: string }) {
  const initial = PAGE_TEMPLATE_KEYS.includes(defaultValue as PageTemplateKey)
    ? (defaultValue as PageTemplateKey)
    : "CENTERED_SUMMARY";
  const [layout, setLayout] = useState<PageTemplateKey>(initial);
  const scroller = useRef<HTMLDivElement>(null);

  function scroll(direction: -1 | 1) {
    scroller.current?.scrollBy({ left: direction * 340, behavior: "smooth" });
  }

  return (
    <fieldset className="min-w-0 sm:col-span-2">
      <div className="mb-2 flex items-center justify-between gap-3">
        <legend className="text-xs text-[var(--fg-dim)]">Page layout</legend>
        <div className="flex gap-1" aria-label="Scroll page layouts">
          <button type="button" aria-label="Scroll layouts left" onClick={() => scroll(-1)} className="border border-[var(--line)] px-2 py-1 text-xs hover:border-[var(--cyan)]">←</button>
          <button type="button" aria-label="Scroll layouts right" onClick={() => scroll(1)} className="border border-[var(--line)] px-2 py-1 text-xs hover:border-[var(--cyan)]">→</button>
        </div>
      </div>
      <div ref={scroller} data-testid="page-layout-scroller" className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-3" tabIndex={0}>
        {PAGE_TEMPLATE_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={layout === key}
            onClick={() => setLayout(key)}
            className={`w-64 shrink-0 snap-start border p-2 text-left transition-colors ${layout === key ? "border-[var(--cyan)] bg-[var(--cyan-soft)]" : "border-[var(--line)] bg-[var(--bg)] hover:border-[var(--line-bright)]"}`}
          >
            <LayoutThumbnail template={key} brandColor={brandColor} />
            <p className="mt-2 text-xs font-semibold text-[var(--fg)]">{PAGE_TEMPLATE_LABELS[key]}</p>
            <p className="mt-1 text-[11px] leading-4 text-[var(--fg-dim)]">{DESCRIPTION[key]}</p>
          </button>
        ))}
      </div>
      <input type="hidden" name="layout" value={layout} />
    </fieldset>
  );
}

function LayoutThumbnail({ template, brandColor }: { template: PageTemplateKey; brandColor: string }) {
  const hero = template === "ILLUSTRATED_HERO" || template === "BANNER_SPOTLIGHT";
  const grid = template === "PRODUCT_GRID";
  const compact = template === "DENSE_OPERATIONS";
  const minimal = template === "MINIMAL_ENTERPRISE";
  const grouped = template === "GROUPED_DIRECTORY";
  const uptime = template === "UPTIME_TIMELINE";
  return (
    <div className={`h-28 overflow-hidden border border-slate-200 ${compact ? "bg-slate-950" : "bg-white"}`}>
      <div className={`flex h-7 items-center justify-between border-b px-2 ${compact ? "border-slate-700" : "border-slate-100"}`}>
        <span className={`h-1.5 w-14 ${compact ? "bg-slate-500" : "bg-slate-700"}`} />
        {!minimal && <span className="h-3 w-10" style={{ backgroundColor: brandColor }} />}
      </div>
      {hero && <div className="h-7 opacity-80" style={{ background: `linear-gradient(110deg, ${brandColor}, #334155)` }} />}
      <div className="p-2">
        <div className={`mb-2 h-3 ${template === "CENTERED_SUMMARY" ? "mx-auto w-3/4" : "w-full"}`} style={{ backgroundColor: brandColor }} />
        {uptime ? (
          <div className="flex gap-0.5">{Array.from({ length: 18 }, (_, index) => <span key={index} className="h-5 flex-1 bg-emerald-500" />)}</div>
        ) : grid ? (
          <div className="grid grid-cols-3 gap-1">{Array.from({ length: 6 }, (_, index) => <span key={index} className="h-5 bg-slate-100" />)}</div>
        ) : grouped ? (
          <div className="space-y-1">{Array.from({ length: 3 }, (_, index) => <span key={index} className="block h-3 border border-slate-200" />)}</div>
        ) : (
          <div className="space-y-1"><span className={`block h-2 ${compact ? "bg-slate-700" : "bg-slate-100"}`} /><span className={`block h-2 w-2/3 ${compact ? "bg-slate-700" : "bg-slate-100"}`} /></div>
        )}
      </div>
    </div>
  );
}

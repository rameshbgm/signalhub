"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Send } from "lucide-react";
import { FluentSelect } from "@/components/FluentSelect";
import { AssetUploader } from "@/components/admin/AssetUploader";
import {
  PAGE_TEMPLATE_LABELS,
  PAGE_THEME_PRESET_KEYS,
  PAGE_THEME_PRESET_LABELS,
  applyPageTemplateLayout,
  designWithThemePreset,
  sameStatusPageDesign,
  statusPageDesignSchema,
  type PageTemplateKey,
  type StatusPageDesign,
} from "@/lib/page-design";
import { publishDesignDraft, saveDesignDraft } from "@/app/admin/(protected)/pages/[pageId]/design/actions";
import type { CoverImageFit } from "@/lib/cover-image";

type AppearancePage = {
  id: string;
  name: string;
  publicPath: string;
  publicAvailable: boolean;
  logoUrl: string | null;
  faviconUrl: string | null;
  coverImageUrl: string | null;
  coverImageFit: CoverImageFit | null;
  coverImagePositionX: number | null;
  coverImagePositionY: number | null;
  coverImageCropX: number | null;
  coverImageCropY: number | null;
  coverImageCropWidth: number | null;
  coverImageCropHeight: number | null;
};

const SIMPLE_LAYOUTS: Array<{
  key: PageTemplateKey;
  name: string;
  description: string;
}> = [
  { key: "CENTERED_SUMMARY", name: "Standard", description: "A clear overview for most service pages." },
  { key: "ILLUSTRATED_HERO", name: "Banner", description: "Lead with a cover image and page identity." },
  { key: "DENSE_OPERATIONS", name: "Compact", description: "Prioritize service detail in less space." },
];

function cloneDesign(design: StatusPageDesign) {
  return structuredClone(design);
}

export function SimpleAppearanceEditor({
  page,
  initialDesign,
  initialPublishedDesign,
  initialRevision,
  publishedVersion,
  embedded = false,
}: {
  page: AppearancePage;
  initialDesign: StatusPageDesign;
  initialPublishedDesign: StatusPageDesign;
  initialRevision: number;
  publishedVersion: number;
  embedded?: boolean;
}) {
  const router = useRouter();
  const [design, setDesign] = useState(() => cloneDesign(initialDesign));
  const [publishedDesign, setPublishedDesign] = useState(() => cloneDesign(initialPublishedDesign));
  const [revision, setRevision] = useState(initialRevision);
  const revisionRef = useRef(initialRevision);
  const [liveVersion, setLiveVersion] = useState(publishedVersion);
  const [saveState, setSaveState] = useState<"SAVED" | "DIRTY" | "SAVING" | "CONFLICT" | "ERROR">("SAVED");
  const [message, setMessage] = useState("");
  const [actionsMount, setActionsMount] = useState<HTMLElement | null>(null);

  function commit(next: StatusPageDesign) {
    if (sameStatusPageDesign(design, next)) return;
    setDesign(next);
    setSaveState("DIRTY");
  }

  async function saveDraft(successMessage = "Draft saved") {
    if (saveState === "SAVING") return false;
    setSaveState("SAVING");
    setMessage("");
    const result = await saveDesignDraft(page.id, design, revisionRef.current);
    if (!result.ok) {
      setSaveState(result.conflict ? "CONFLICT" : "ERROR");
      setMessage(result.error);
      return false;
    }
    revisionRef.current = result.revision;
    setRevision(result.revision);
    setLiveVersion(result.liveVersion ?? liveVersion);
    setSaveState("SAVED");
    setMessage(result.unchanged ? "Draft is up to date" : successMessage);
    router.refresh();
    return true;
  }

  async function publish() {
    const saved = await saveDraft("Draft saved");
    if (!saved) return;
    setSaveState("SAVING");
    setMessage("");
    const result = await publishDesignDraft(page.id, revisionRef.current);
    if (!result.ok) {
      setSaveState(result.conflict ? "CONFLICT" : "ERROR");
      setMessage(result.error);
      return;
    }
    setPublishedDesign(cloneDesign(design));
    setLiveVersion(result.liveVersion ?? liveVersion);
    setSaveState("SAVED");
    setMessage(result.unchanged ? "No unpublished changes" : `Published version ${result.liveVersion}`);
    router.refresh();
  }

  useEffect(() => {
    if (saveState !== "DIRTY") return;
    const timer = window.setTimeout(() => { void saveDraft("Draft autosaved"); }, 800);
    return () => window.clearTimeout(timer);
    // saveDraft intentionally saves the latest rendered draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design, saveState]);

  useEffect(() => {
    if (!embedded) return;
    const frame = window.requestAnimationFrame(() => {
      setActionsMount(document.getElementById("page-management-actions"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [embedded]);

  function selectLayout(key: PageTemplateKey) {
    commit(applyPageTemplateLayout(design, key));
  }

  function selectPreset(key: string) {
    commit(designWithThemePreset(design, key as StatusPageDesign["theme"]["preset"]));
  }

  function updatePresentation(patch: Partial<StatusPageDesign["presentation"]>) {
    const next = cloneDesign(design);
    next.presentation = { ...next.presentation, ...patch };
    commit(statusPageDesignSchema.parse(next));
  }

  const currentLayout = SIMPLE_LAYOUTS.find((layout) => layout.key === design.templateKey);
  const hasUnpublishedChanges = !sameStatusPageDesign(design, publishedDesign);
  const saveLabel = saveState === "SAVING"
    ? "Saving draft"
    : saveState === "DIRTY"
      ? "Saving changes"
      : saveState === "CONFLICT"
        ? "Reload needed"
        : saveState === "ERROR"
          ? "Save failed"
          : `Draft r${revision}`;

  const actionControls = (
    <div className="flex shrink-0 items-center gap-2 pb-2 md:pb-1">
      {page.publicAvailable ? (
        <Link href={page.publicPath} target="_blank" rel="noreferrer" aria-label="Preview public page" title="Preview public page" className="page-management-action-icon rounded-lg border border-[var(--line-bright)] bg-[var(--surface)] text-[var(--cyan)] hover:bg-[var(--cyan-soft)]">
          <Eye aria-hidden="true" size={17} />
        </Link>
      ) : (
        <button type="button" disabled aria-label="Preview unavailable until the page is published" title="Preview is available after publishing" className="page-management-action-icon cursor-not-allowed rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--fg-dim)] opacity-70">
          <Eye aria-hidden="true" size={17} />
        </button>
      )}
      <button
        type="button"
        data-button-guard="off"
        aria-label="Publish changes"
        title="Publish changes"
        onClick={() => void publish()}
        disabled={!hasUnpublishedChanges || saveState === "SAVING" || saveState === "CONFLICT"}
        className="page-management-action-icon rounded-lg bg-[var(--cyan)] text-[var(--on-cyan)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Send aria-hidden="true" size={17} />
        <span className="sr-only">Publish changes</span>
      </button>
    </div>
  );

  return (
    <>
      {embedded && actionsMount ? createPortal(actionControls, actionsMount) : null}
      <div className={`mx-auto w-full ${embedded ? "max-w-none" : "max-w-4xl"} pb-12`}>
        <header className="flex flex-col gap-4 border-b border-[var(--line)] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {!embedded && <Link href={`/organization/pages/${page.id}`} className="text-sm font-semibold text-[var(--cyan)] hover:underline">Back to page</Link>}
            <h1 className={`${embedded ? "mt-0" : "mt-3"} text-3xl font-semibold tracking-tight text-[var(--fg)]`}>Appearance</h1>
            <p className="mt-2 text-sm text-[var(--fg-soft)]">Choose a layout and add your brand. Changes stay private until you publish.</p>
          </div>
          {!embedded && actionControls}
        </header>

      {message && (
        <p role={saveState === "ERROR" || saveState === "CONFLICT" ? "alert" : "status"} className={`mt-4 text-sm ${saveState === "ERROR" || saveState === "CONFLICT" ? "text-[var(--red)]" : "text-[var(--fg-soft)]"}`}>
          {message}
        </p>
      )}

      <main className="mt-8 space-y-10">
        <section aria-labelledby="layout-heading">
          <div className="max-w-2xl">
            <h2 id="layout-heading" className="text-lg font-semibold text-[var(--fg)]">Layout</h2>
            <p className="mt-1 text-sm text-[var(--fg-soft)]">Pick the structure that best fits this status page.</p>
          </div>
          {!currentLayout && (
            <p className="mt-4 border-l-2 border-[var(--amber)] pl-3 text-sm text-[var(--fg-soft)]">
              Current layout: {PAGE_TEMPLATE_LABELS[design.templateKey]}. It is preserved until you choose one of the layouts below.
            </p>
          )}
          <div className="mt-5 grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Page layout">
            {SIMPLE_LAYOUTS.map((layout) => {
              const selected = design.templateKey === layout.key;
              return (
                <button
                  key={layout.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => selectLayout(layout.key)}
                  className={`min-h-32 rounded-md border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)] ${selected ? "border-[var(--cyan)] bg-[var(--cyan-soft)]" : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--line-bright)]"}`}
                >
                  <span className="block text-base font-semibold text-[var(--fg)]">{layout.name}</span>
                  <span className="mt-2 block text-sm leading-6 text-[var(--fg-soft)]">{layout.description}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="style-heading" className="border-t border-[var(--line)] pt-8">
          <div className="max-w-2xl">
            <h2 id="style-heading" className="text-lg font-semibold text-[var(--fg)]">Style</h2>
            <p className="mt-1 text-sm text-[var(--fg-soft)]">Choose a preset to set the page colors and visual tone.</p>
          </div>
          <div className="mt-5 max-w-xl">
            <label className="text-sm font-medium text-[var(--fg)]">
              Style preset
              <FluentSelect aria-label="Style preset" value={design.theme.preset} onChange={(event) => selectPreset(event.target.value)} className="mt-2 w-full border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--fg)]">
                {PAGE_THEME_PRESET_KEYS.map((preset) => <option key={preset} value={preset}>{PAGE_THEME_PRESET_LABELS[preset]}</option>)}
              </FluentSelect>
            </label>
          </div>
        </section>

        <section aria-labelledby="brand-heading" className="border-t border-[var(--line)] pt-8">
          <div className="max-w-2xl">
            <h2 id="brand-heading" className="text-lg font-semibold text-[var(--fg)]">Brand assets</h2>
            <p className="mt-1 text-sm text-[var(--fg-soft)]">Add the images visitors recognize. New cover images are shown in full by default.</p>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <AssetUploader pageId={page.id} kind="LOGO" currentUrl={design.presentation.logoUrl} label="Logo" help="Used in the public page header." staged simple onStagedChange={({ url }) => updatePresentation({ logoUrl: url })} />
            <AssetUploader pageId={page.id} kind="FAVICON" currentUrl={design.presentation.faviconUrl} label="Site icon" help="Shown in supported browser tabs." staged simple onStagedChange={({ url }) => updatePresentation({ faviconUrl: url })} />
            <AssetUploader
              pageId={page.id}
              kind="COVER"
              currentUrl={design.presentation.coverImageUrl}
              currentCoverFit={design.presentation.coverImageFit}
              currentCoverPositionX={design.presentation.coverImagePositionX}
              currentCoverPositionY={design.presentation.coverImagePositionY}
              currentCoverCropX={design.presentation.coverImageCropX}
              currentCoverCropY={design.presentation.coverImageCropY}
              currentCoverCropWidth={design.presentation.coverImageCropWidth}
              currentCoverCropHeight={design.presentation.coverImageCropHeight}
              label="Cover image"
              help="Used by the banner layout."
              staged
              simple
              onStagedChange={({ url, cover }) => updatePresentation({
                coverImageUrl: url,
                ...(cover ? {
                  coverImageFit: cover.fit,
                  coverImagePositionX: cover.positionX,
                  coverImagePositionY: cover.positionY,
                  coverImageCropX: cover.crop?.x ?? null,
                  coverImageCropY: cover.crop?.y ?? null,
                  coverImageCropWidth: cover.crop?.width ?? null,
                  coverImageCropHeight: cover.crop?.height ?? null,
                } : {}),
              })}
            />
          </div>
        </section>
      </main>

      <footer className="mt-10 border-t border-[var(--line)] pt-6">
        <p className={`text-sm ${saveState === "ERROR" || saveState === "CONFLICT" ? "text-[var(--red)]" : "text-[var(--fg-soft)]"}`}>{saveLabel}</p>
      </footer>
      </div>
    </>
  );
}

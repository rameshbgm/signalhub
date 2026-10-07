"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChartLine, Check, ChevronLeft, Eye, ImageIcon, LayoutTemplate, Link2, Palette, Send } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { IconTile } from "@/components/ui/icon-tile";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { AssetUploader } from "@/components/admin/AssetUploader";
import { cn } from "@/lib/utils";
import {
  PAGE_TEMPLATE_LABELS,
  PAGE_THEME_PRESET_DESCRIPTIONS,
  PAGE_THEME_PRESET_KEYS,
  PAGE_THEME_PRESET_LABELS,
  applyPageTemplateLayout,
  contrastRatio,
  METRIC_LENSES,
  METRIC_RANGES,
  METRIC_VIEWS,
  designWithThemePreset,
  metricBlockSettings,
  pageThemePreset,
  sameStatusPageDesign,
  statusPageDesignSchema,
  withMetricBlockSettings,
  type MetricBlockSettings,
  type PageTemplateKey,
  type PageThemePresetKey,
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

const METRIC_RANGE_LABELS: Record<(typeof METRIC_RANGES)[number], string> = { "24h": "24 hours", "7d": "7 days", "30d": "30 days", "90d": "90 days" };
const METRIC_LENS_LABELS: Record<(typeof METRIC_LENSES)[number], string> = {
  trend: "Trend", percentiles: "Percentiles (p50 / p95 / p99)", distribution: "Distribution", uptime: "Uptime & calendar", responses: "Status codes & errors",
};
const METRIC_VIEW_LABELS: Record<(typeof METRIC_VIEWS)[number], string> = {
  line: "Line", area: "Area", bar: "Bars", step: "Step", scatter: "Scatter", bands: "Min / avg / max", gauge: "Gauge", heatmap: "Heatmap",
};

/** A group of checkboxes that always keeps at least one option selected. */
function OptionGroup<T extends string>({ legend, options, labels, selected, onChange }: {
  legend: string;
  options: readonly T[];
  labels: Record<T, string>;
  selected: readonly T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-ink">{legend}</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {options.map((option) => {
          const checked = selected.includes(option);
          return (
            <label key={option} className="flex items-center gap-2 text-sm text-ink-soft">
              <Checkbox
                checked={checked}
                disabled={checked && selected.length === 1}
                onChange={() => onChange(options.filter((candidate) => (candidate === option ? !checked : selected.includes(candidate))))}
              />
              {labels[option]}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

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
  const [brandError, setBrandError] = useState<string | null>(null);

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

  function selectPreset(key: PageThemePresetKey) {
    commit(designWithThemePreset(design, key));
  }

  const metricSettings = metricBlockSettings(design);

  function updateMetrics(patch: Partial<MetricBlockSettings>) {
    const next = { ...metricSettings!, ...patch };
    // The default range must stay one of the enabled ranges.
    if (!next.ranges.includes(next.defaultRange)) next.defaultRange = next.ranges[0];
    commit(withMetricBlockSettings(design, next));
  }

  function updatePresentation(patch: Partial<StatusPageDesign["presentation"]>) {
    const next = cloneDesign(design);
    next.presentation = { ...next.presentation, ...patch };
    commit(statusPageDesignSchema.parse(next));
  }

  /** Validates through the design schema so an invalid value never reaches the draft. */
  function tryCommit(mutate: (next: StatusPageDesign) => void) {
    const next = cloneDesign(design);
    mutate(next);
    const parsed = statusPageDesignSchema.safeParse(next);
    if (!parsed.success) return parsed.error.issues[0]?.message ?? "This value is not valid";
    commit(parsed.data);
    return null;
  }

  function selectBrandColor(color: string) {
    // Buttons and banners put white text on the brand color (WCAG AA for UI text).
    if (contrastRatio("#ffffff", color) < 3) {
      setBrandError("Choose a darker color so white button text stays readable.");
      return;
    }
    setBrandError(null);
    tryCommit((next) => { next.theme.palette.brand = color; });
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

  const saveFailed = saveState === "ERROR" || saveState === "CONFLICT";
  const saveTone: StatusTone = saveFailed ? "danger" : saveState === "SAVED" ? "neutral" : "info";

  const actionControls = (
    <div className="flex shrink-0 items-center gap-2">
      {page.publicAvailable ? (
        <Link href={page.publicPath} target="_blank" rel="noreferrer" aria-label="Preview public page" title="Preview public page" className={buttonVariants({ variant: "secondary", className: "max-sm:min-h-11" })}>
          <Eye aria-hidden="true" size={16} />
          <span className="max-sm:sr-only">Preview</span>
        </Link>
      ) : (
        <Button type="button" variant="secondary" disabled aria-label="Preview unavailable until the page is published" title="Preview is available after publishing" className="max-sm:min-h-11">
          <Eye aria-hidden="true" size={16} />
          <span className="max-sm:sr-only">Preview</span>
        </Button>
      )}
      <Button
        type="button"
        data-button-guard="off"
        title="Publish changes"
        onClick={() => void publish()}
        disabled={!hasUnpublishedChanges || saveState === "SAVING" || saveState === "CONFLICT"}
        loading={saveState === "SAVING"}
        className="max-sm:min-h-11"
      >
        <Send aria-hidden="true" size={16} />
        Publish changes
      </Button>
    </div>
  );

  const stateBadges = (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge tone={saveTone} live={saveState === "SAVING" || saveState === "DIRTY"}>{saveLabel}</StatusBadge>
      {saveState === "SAVED" && (
        <StatusBadge tone={hasUnpublishedChanges ? "warn" : "ok"}>{hasUnpublishedChanges ? "Unpublished changes" : "No unpublished changes"}</StatusBadge>
      )}
    </div>
  );

  const description = "Choose a layout and add your brand. Changes stay private until you publish.";

  return (
    <>
      {embedded && actionsMount ? createPortal(actionControls, actionsMount) : null}
      <div className="space-y-8 pb-6">
        <div className="space-y-3">
          {embedded ? (
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold tracking-tight text-ink">Appearance</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-soft">{description}</p>
              </div>
              {stateBadges}
            </header>
          ) : (
            <div className="space-y-4">
              <Link href={`/organization/pages/${page.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                <ChevronLeft aria-hidden="true" size={16} />
                Back to page
              </Link>
              <PageHeader title="Appearance" description={description} icon={Palette} hue="violet" actions={<>{stateBadges}{actionControls}</>} />
            </div>
          )}

          {message && (saveFailed
            ? <Alert tone="danger">{message}</Alert>
            : <p role="status" className="text-sm text-ink-soft">{message}</p>)}
        </div>

        <section aria-labelledby="layout-heading">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3.5">
                <IconTile icon={LayoutTemplate} hue="indigo" />
                <div className="min-w-0">
                  <CardTitle id="layout-heading">Layout</CardTitle>
                  <CardDescription>Pick the structure that best fits this status page.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!currentLayout && (
                <Alert tone="info">
                  Current layout: {PAGE_TEMPLATE_LABELS[design.templateKey]}. It is preserved until you choose one of the layouts below.
                </Alert>
              )}
              <div className="grid gap-4 sm:grid-cols-3" role="radiogroup" aria-label="Page layout">
                {SIMPLE_LAYOUTS.map((layout) => {
                  const selected = design.templateKey === layout.key;
                  return (
                    <button
                      key={layout.key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => selectLayout(layout.key)}
                      className={cn(
                        "flex flex-col gap-3 rounded-card border p-4 text-left outline-none transition-[background-color,border-color,box-shadow] duration-200 ease-soft focus-visible:ring-4 focus-visible:ring-primary/25",
                        selected ? "border-primary bg-primary-soft shadow-card" : "border-line-strong bg-surface hover:border-primary/40 hover:bg-sunken",
                      )}
                    >
                      <LayoutSketch layout={layout.key} selected={selected} />
                      <span className="block">
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-base font-semibold text-ink">{layout.name}</span>
                          {selected && (
                            <span aria-hidden="true" className="inline-flex shrink-0 text-primary">
                              <Check size={16} />
                            </span>
                          )}
                        </span>
                        <span className="mt-1 block text-sm leading-6 text-ink-soft">{layout.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </section>

        {metricSettings && (
          <section aria-labelledby="metrics-heading">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3.5">
                  <IconTile icon={ChartLine} hue="sky" />
                  <div className="min-w-0">
                    <CardTitle id="metrics-heading">Metric charts</CardTitle>
                    <CardDescription>Choose what visitors can switch between on each metric chart. Everything is on by default.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <OptionGroup legend="Time ranges" options={METRIC_RANGES} labels={METRIC_RANGE_LABELS} selected={metricSettings.ranges} onChange={(ranges) => updateMetrics({ ranges })} />
                <Field label="Default range" htmlFor="metric-default-range" className="max-w-xs">
                  <Select id="metric-default-range" value={metricSettings.defaultRange} onChange={(event) => updateMetrics({ defaultRange: event.target.value as MetricBlockSettings["defaultRange"] })}>
                    {metricSettings.ranges.map((range) => <option key={range} value={range}>{METRIC_RANGE_LABELS[range]}</option>)}
                  </Select>
                </Field>
                <OptionGroup legend="Information" options={METRIC_LENSES} labels={METRIC_LENS_LABELS} selected={metricSettings.lenses} onChange={(lenses) => updateMetrics({ lenses })} />
                <OptionGroup legend="Chart styles" options={METRIC_VIEWS} labels={METRIC_VIEW_LABELS} selected={metricSettings.chartViews} onChange={(chartViews) => updateMetrics({ chartViews })} />
                <label className="flex items-center gap-2 text-sm text-ink-soft">
                  <Checkbox checked={metricSettings.showStats} onChange={(event) => updateMetrics({ showStats: event.target.checked })} />
                  Show the summary strip (latest, average, min, max, p95)
                </label>
              </CardContent>
            </Card>
          </section>
        )}

        <section aria-labelledby="style-heading">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3.5">
                <IconTile icon={Palette} hue="violet" />
                <div className="min-w-0">
                  <CardTitle id="style-heading">Style</CardTitle>
                  <CardDescription>Each card previews the colors, corners, and depth your visitors will see.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-labelledby="style-heading">
                {PAGE_THEME_PRESET_KEYS.map((preset) => {
                  const selected = design.theme.preset === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={`${PAGE_THEME_PRESET_LABELS[preset]} style`}
                      onClick={() => selectPreset(preset)}
                      className={cn(
                        "group flex flex-col overflow-hidden rounded-card border text-left outline-none transition-[border-color,box-shadow] duration-200 ease-soft focus-visible:ring-4 focus-visible:ring-primary/25",
                        selected ? "border-primary shadow-card ring-1 ring-primary" : "border-line-strong hover:border-primary/40",
                      )}
                    >
                      {/* The selected tile previews the page's current brand color. */}
                      <StylePreview preset={preset} brandOverride={selected ? design.theme.palette.brand : undefined} />
                      <span className="flex items-start justify-between gap-2 border-t border-line bg-surface px-4 py-3">
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-ink">{PAGE_THEME_PRESET_LABELS[preset]}</span>
                          <span className="mt-0.5 block text-xs leading-5 text-ink-soft">{PAGE_THEME_PRESET_DESCRIPTIONS[preset]}</span>
                        </span>
                        {selected && <Check aria-hidden size={16} className="mt-0.5 shrink-0 text-primary" />}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-5 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">Brand color</p>
                  <p className="text-xs leading-5 text-ink-soft">Used for buttons, links, and banners. Choosing a style resets it to that style&apos;s color.</p>
                  {brandError && <p role="alert" className="mt-1 text-xs text-danger-fg">{brandError}</p>}
                </div>
                <label className="flex shrink-0 items-center gap-3 rounded-control border border-line-strong bg-surface px-3 py-1.5 shadow-card">
                  <input
                    type="color"
                    aria-label="Brand color"
                    value={design.theme.palette.brand}
                    onChange={(event) => selectBrandColor(event.target.value)}
                    className="size-7 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                  <span className="font-mono text-sm uppercase text-ink">{design.theme.palette.brand}</span>
                </label>
              </div>
            </CardContent>
          </Card>
        </section>

        <VisitorDetailsCard design={design} tryCommit={tryCommit} />

        <section aria-labelledby="brand-heading">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3.5">
                <IconTile icon={ImageIcon} hue="sky" />
                <div className="min-w-0">
                  <CardTitle id="brand-heading">Brand assets</CardTitle>
                  <CardDescription>Add the images visitors recognize. New cover images are shown in full by default.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
            </CardContent>
          </Card>
        </section>
      </div>
    </>
  );
}

type VisitorField = {
  key: "supportUrl" | "termsUrl" | "privacyUrl" | "seoTitle" | "seoDescription";
  label: string;
  placeholder: string;
  hint?: string;
  multiline?: boolean;
  maxLength?: number;
};

const VISITOR_FIELDS: VisitorField[] = [
  { key: "supportUrl", label: "Support link", placeholder: "https://support.example.com or mailto:help@example.com" },
  { key: "termsUrl", label: "Terms of service", placeholder: "https://example.com/terms" },
  { key: "privacyUrl", label: "Privacy policy", placeholder: "https://example.com/privacy" },
  { key: "seoTitle", label: "Search title", placeholder: "Defaults to the page name and headline", maxLength: 160 },
  { key: "seoDescription", label: "Search description", placeholder: "Defaults to the about text", hint: "Shown by search engines and link previews.", multiline: true, maxLength: 320 },
];

function visitorValue(design: StatusPageDesign, key: VisitorField["key"]) {
  if (key === "seoTitle") return design.seo.title;
  if (key === "seoDescription") return design.seo.description;
  return design.presentation[key] ?? "";
}

/**
 * Links shown in the public footer plus search metadata. Each field keeps its
 * own text while typing and only reaches the draft once it validates, so a
 * half-typed URL never blocks autosave or publishing.
 */
function VisitorDetailsCard({ design, tryCommit }: { design: StatusPageDesign; tryCommit: (mutate: (next: StatusPageDesign) => void) => string | null }) {
  const [values, setValues] = useState(() => Object.fromEntries(VISITOR_FIELDS.map((field) => [field.key, visitorValue(design, field.key)])) as Record<VisitorField["key"], string>);
  const [errors, setErrors] = useState<Partial<Record<VisitorField["key"], string>>>({});

  function save(key: VisitorField["key"]) {
    const raw = values[key].trim();
    if (raw === visitorValue(design, key)) {
      setErrors((current) => ({ ...current, [key]: undefined }));
      return;
    }
    const error = tryCommit((next) => {
      if (key === "seoTitle") next.seo.title = raw;
      else if (key === "seoDescription") next.seo.description = raw;
      else next.presentation[key] = raw || null;
    });
    setErrors((current) => ({ ...current, [key]: error ?? undefined }));
  }

  return (
    <section aria-labelledby="visitor-heading">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3.5">
            <IconTile icon={Link2} hue="emerald" />
            <div className="min-w-0">
              <CardTitle id="visitor-heading">Visitor links &amp; search</CardTitle>
              <CardDescription>Footer links and how the page appears in search results. Saved with your draft and published together.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
            {VISITOR_FIELDS.map((field) => {
              const id = `visitor-${field.key}`;
              const common = {
                id,
                value: values[field.key],
                placeholder: field.placeholder,
                maxLength: field.maxLength,
                "aria-invalid": errors[field.key] ? true : undefined,
                onBlur: () => save(field.key),
              };
              return (
                <Field key={field.key} label={field.label} htmlFor={id} hint={field.hint} error={errors[field.key]} className={field.multiline ? "sm:col-span-2" : undefined}>
                  {field.multiline
                    ? <Textarea {...common} rows={2} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} />
                    : <Input {...common} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") save(field.key); }} />}
                </Field>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

const PREVIEW_RADIUS: Record<StatusPageDesign["theme"]["radius"], number> = { NONE: 0, SMALL: 3, MEDIUM: 6, LARGE: 9 };

/**
 * A swatch of the preset's real theme values: background, card surface, brand
 * bar, text, corner radius, and depth. Placeholder lines only, no status copy.
 */
function StylePreview({ preset, brandOverride }: { preset: PageThemePresetKey; brandOverride?: string }) {
  const theme = pageThemePreset(preset);
  const palette = { ...theme.palette, ...(brandOverride ? { brand: brandOverride } : {}) };
  const radius = PREVIEW_RADIUS[theme.radius] ?? 6;
  const shadow = theme.shadow === "NONE" ? "none" : theme.shadow === "ELEVATED" ? "0 6px 16px rgb(15 23 42 / 0.12)" : "0 1px 3px rgb(15 23 42 / 0.10)";
  const rows = [0, 1, 2];
  return (
    <span aria-hidden="true" className="block p-3.5" style={{ background: palette.background }}>
      <span className="mb-2 flex items-center gap-1.5">
        <span className="block size-3" style={{ background: palette.brand, borderRadius: Math.min(radius, 4) }} />
        <span className="block h-1.5 w-14 rounded-full" style={{ background: palette.text, opacity: 0.75 }} />
      </span>
      <span className="block overflow-hidden" style={{ background: palette.surface, borderRadius: radius, boxShadow: shadow, border: `1px solid ${palette.text}14` }}>
        <span className="flex items-center gap-1.5 px-2.5 py-2" style={{ background: palette.brand }}>
          <span className="block size-2 rounded-full bg-white/90" />
          <span className="block h-1.5 w-20 rounded-full bg-white/85" />
        </span>
        {rows.map((index) => (
          <span key={index} className="flex items-center justify-between gap-2 px-2.5 py-1.5" style={{ borderTop: index ? `1px solid ${palette.text}12` : undefined }}>
            <span className="block h-1.5 rounded-full" style={{ width: `${44 - index * 8}%`, background: palette.mutedText, opacity: 0.7 }} />
            <span className="block size-2 rounded-full" style={{ background: index === 2 ? palette.accent : palette.brand, opacity: 0.8 }} />
          </span>
        ))}
      </span>
    </span>
  );
}

/** A tiny wireframe of each layout so the choice is visible, not just named. */
function LayoutSketch({ layout, selected }: { layout: PageTemplateKey; selected: boolean }) {
  const strong = selected ? "bg-primary/60" : "bg-ink-dim/40";
  const soft = selected ? "bg-primary/20" : "bg-line";
  return (
    <span aria-hidden="true" className="block h-24 space-y-1.5 overflow-hidden rounded-control border border-line bg-surface p-2.5">
      {layout === "ILLUSTRATED_HERO" ? (
        <>
          <span className="block h-9 rounded-chip bg-gradient-to-r from-primary/40 to-accent/40" />
          <span className={cn("block h-2 rounded-chip", soft)} />
          <span className={cn("block h-2 rounded-chip", soft)} />
        </>
      ) : layout === "DENSE_OPERATIONS" ? (
        <span className="grid grid-cols-2 gap-1.5">
          {Array.from({ length: 8 }, (_, index) => <span key={index} className={cn("block h-3 rounded-chip", index === 0 ? strong : soft)} />)}
        </span>
      ) : (
        <>
          <span className={cn("mx-auto block h-3 w-1/2 rounded-full", strong)} />
          <span className={cn("block h-3 rounded-chip", soft)} />
          <span className={cn("block h-3 rounded-chip", soft)} />
          <span className={cn("block h-3 rounded-chip", soft)} />
        </>
      )}
    </span>
  );
}

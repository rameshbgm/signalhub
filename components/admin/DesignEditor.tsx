"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
} from "@fluentui/react-components";
import { FluentSelect } from "@/components/FluentSelect";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  PAGE_TEMPLATE_KEYS,
  PAGE_TEMPLATE_LABELS,
  PAGE_THEME_PRESET_DESCRIPTIONS,
  PAGE_THEME_PRESET_KEYS,
  UPTIME_BAR_SIZES,
  UPTIME_BAR_STYLES,
  UPTIME_ICON_STYLES,
  designWithThemePreset,
  movePageDesignBlock,
  statusPageDesignSchema,
  templateDesign,
  type PageDesignBlock,
  type PageDesignZone,
  type PageSurfaceKey,
  type PageTemplateKey,
  type PageThemePresetKey,
  type StatusPageDesign,
} from "@/lib/page-design";
import {
  createAnnouncement,
  deleteAnnouncement,
  duplicateStatusPage,
  reorderPageComponents,
  resetLegacyCss,
  saveDesignerBranding,
  saveDesign,
} from "@/app/admin/(protected)/pages/[pageId]/design/actions";
import { COMPONENT_STATUS_COLOR } from "@/lib/status";
import { coverImageStyle, type CoverImageFit } from "@/lib/cover-image";

type EditorPage = {
  id: string;
  name: string;
  headline: string;
  aboutText: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  coverImageUrl: string | null;
  coverImageFit?: CoverImageFit | null;
  coverImagePositionX?: number | null;
  coverImagePositionY?: number | null;
  coverImageCropX?: number | null;
  coverImageCropY?: number | null;
  coverImageCropWidth?: number | null;
  coverImageCropHeight?: number | null;
  supportUrl: string | null;
  publicPath: string;
  legacyCssActive: boolean;
};

type StructureGroup = {
  id: string;
  name: string;
  collapsed: boolean;
  components: Array<{ id: string; name: string }>;
};

type EditorAnnouncement = {
  id: string;
  title: string;
  body: string;
  severity: "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";
  ctaLabel: string | null;
  ctaUrl: string | null;
  startsAt: string;
  endsAt: string | null;
  dismissible: boolean;
  priority: number;
};

const SURFACES: Array<{ key: PageSurfaceKey; label: string }> = [
  { key: "status", label: "Status" },
  { key: "history", label: "History" },
  { key: "incident", label: "Incident" },
  { key: "access", label: "Access" },
  { key: "hub", label: "Hub" },
  { key: "embed", label: "Embed" },
];

const ZONES: Array<{ key: PageDesignZone; label: string }> = [
  { key: "full", label: "Full width" },
  { key: "primary", label: "Primary" },
  { key: "sidebar", label: "Sidebar" },
];

const BLOCK_LIBRARY: Array<{ type: PageDesignBlock["type"]; label: string; surfaces: PageSurfaceKey[] }> = [
  { type: "OVERALL_STATUS", label: "Overall status", surfaces: ["status", "hub", "embed"] },
  { type: "ANNOUNCEMENTS", label: "Announcements", surfaces: ["status", "history", "incident", "hub"] },
  { type: "RICH_TEXT", label: "Rich text", surfaces: ["status", "history", "incident", "access", "hub"] },
  { type: "COMPONENT_STATUS", label: "Component status", surfaces: ["status"] },
  { type: "ACTIVE_INCIDENTS", label: "Active incidents", surfaces: ["status", "hub"] },
  { type: "SCHEDULED_MAINTENANCE", label: "Maintenance", surfaces: ["status", "hub"] },
  { type: "METRICS", label: "Metrics", surfaces: ["status"] },
  { type: "HISTORY_PREVIEW", label: "History preview", surfaces: ["status", "hub"] },
  { type: "SUBSCRIBE", label: "Subscribe", surfaces: ["status", "history", "incident", "hub"] },
  { type: "LINK_CARDS", label: "Link cards", surfaces: ["status", "history", "access", "hub"] },
  { type: "HISTORY_LIST", label: "History list", surfaces: ["history"] },
  { type: "INCIDENT_DETAIL", label: "Incident detail", surfaces: ["incident"] },
  { type: "ACCESS_FORM", label: "Access form", surfaces: ["access"] },
  { type: "HUB_GRID", label: "Hub grid", surfaces: ["hub"] },
];

const REPEATABLE_BLOCK_TYPES = new Set<PageDesignBlock["type"]>(["RICH_TEXT", "LINK_CARDS"]);

const STANDARD_STATUS_COLORS = {
  operational: COMPONENT_STATUS_COLOR.OPERATIONAL,
  degraded: COMPONENT_STATUS_COLOR.DEGRADED_PERFORMANCE,
  partialOutage: COMPONENT_STATUS_COLOR.PARTIAL_OUTAGE,
  majorOutage: COMPONENT_STATUS_COLOR.MAJOR_OUTAGE,
  maintenance: COMPONENT_STATUS_COLOR.UNDER_MAINTENANCE,
} as const;

function cloneDesign(design: StatusPageDesign): StatusPageDesign {
  return structuredClone(design);
}

function newBlock(type: PageDesignBlock["type"]): PageDesignBlock {
  const id = `${type.toLowerCase()}-${crypto.randomUUID()}`;
  switch (type) {
    case "OVERALL_STATUS":
      return { id, type, hidden: false, settings: { style: "PANEL", showLastUpdated: true, showDescription: true } };
    case "ANNOUNCEMENTS":
      return { id, type, hidden: false, settings: { maxItems: 3 } };
    case "RICH_TEXT":
      return { id, type, hidden: false, settings: { heading: "About this service", body: "", align: "LEFT" } };
    case "COMPONENT_STATUS":
      return { id, type, hidden: false, settings: { view: "LIST", uptimeDays: 90, uptimeStyle: "ROUNDED", uptimeSize: "RESPONSIVE", uptimeIcon: "NONE", groupStyle: "ACCORDION", groupingEnabled: false, componentStyle: "ROWS", componentColumns: 3, showSummary: false, showLegend: false, showDescriptions: true, showUptime: true, searchEnabled: false } };
    case "ACTIVE_INCIDENTS":
      return { id, type, hidden: false, settings: { heading: "Active incidents" } };
    case "SCHEDULED_MAINTENANCE":
      return { id, type, hidden: false, settings: { heading: "Scheduled maintenance" } };
    case "METRICS":
      return { id, type, hidden: false, settings: { heading: "System metrics", columns: 2 } };
    case "HISTORY_PREVIEW":
      return { id, type, hidden: false, settings: { heading: "Past incidents", days: 14 } };
    case "SUBSCRIBE":
      return { id, type, hidden: false, settings: { style: "BUTTON", heading: "Subscribe to updates" } };
    case "LINK_CARDS":
      return { id, type, hidden: false, settings: { links: [] } };
    case "HISTORY_LIST":
      return { id, type, hidden: false, settings: { showMaintenance: true } };
    case "INCIDENT_DETAIL":
      return { id, type, hidden: false, settings: { showAffectedComponents: true, showPostmortem: true } };
    case "ACCESS_FORM":
      return { id, type, hidden: false, settings: { style: "CARD" } };
    case "HUB_GRID":
      return { id, type, hidden: false, settings: { columns: 2, showDescriptions: true } };
  }
}

function blockLabel(block: PageDesignBlock) {
  return BLOCK_LIBRARY.find((item) => item.type === block.type)?.label ??
    block.type.toLowerCase().replaceAll("_", " ").replace(/^\w/, (character) => character.toUpperCase());
}

function findDesignBlock(design: StatusPageDesign, surface: PageSurfaceKey, blockId: string) {
  for (const zone of ZONES) {
    const block = design.surfaces[surface][zone.key].find((candidate) => candidate.id === blockId);
    if (block) return { block, zone: zone.key };
  }
  return null;
}

function settingLabel(key: string) {
  const words = key.replace(/([A-Z])/g, " $1").replaceAll("_", " ").trim().toLowerCase();
  return words.replace(/^\w/, (character) => character.toUpperCase());
}

function changeValue(value: unknown) {
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (value === null || value === undefined || value === "") return "None";
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  return serialized.length > 72 ? `${serialized.slice(0, 69)}…` : serialized;
}

function describeBlockChanges(
  savedDesign: StatusPageDesign,
  surface: PageSurfaceKey,
  current: { block: PageDesignBlock; zone: PageDesignZone }
) {
  const saved = findDesignBlock(savedDesign, surface, current.block.id);
  if (!saved) return [`Added to the ${settingLabel(current.zone)} zone`];

  const changes: string[] = [];
  if (saved.zone !== current.zone) {
    changes.push(`Zone: ${settingLabel(saved.zone)} → ${settingLabel(current.zone)}`);
  }
  if (saved.block.hidden !== current.block.hidden) {
    changes.push(`Visibility: ${saved.block.hidden ? "Hidden" : "Visible"} → ${current.block.hidden ? "Hidden" : "Visible"}`);
  }
  const savedSettings = saved.block.settings as Record<string, unknown>;
  const currentSettings = current.block.settings as Record<string, unknown>;
  for (const key of new Set([...Object.keys(savedSettings), ...Object.keys(currentSettings)])) {
    if (JSON.stringify(savedSettings[key]) !== JSON.stringify(currentSettings[key])) {
      changes.push(`${settingLabel(key)}: ${changeValue(savedSettings[key])} → ${changeValue(currentSettings[key])}`);
    }
  }
  return changes;
}

export function DesignEditor({
  page,
  initialDesign,
  initialRevision,
  publishedVersion,
  versions,
  announcements,
  groups,
  ungrouped,
}: {
  page: EditorPage;
  initialDesign: StatusPageDesign;
  initialRevision: number;
  publishedVersion: number;
  versions: Array<{ version: number; templateKey: string; savedAt: string; design: StatusPageDesign }>;
  announcements: EditorAnnouncement[];
  groups: StructureGroup[];
  ungrouped: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [design, setDesign] = useState(initialDesign);
  const [savedDesign, setSavedDesign] = useState(() => cloneDesign(initialDesign));
  const [revision, setRevision] = useState(initialRevision);
  const revisionRef = useRef(initialRevision);
  const [surface, setSurface] = useState<PageSurfaceKey>("status");
  const [selectedId, setSelectedId] = useState<string | null>(initialDesign.surfaces.status.full[0]?.id ?? null);
  const [viewport, setViewport] = useState<"DESKTOP" | "TABLET" | "MOBILE">("DESKTOP");
  const [saveState, setSaveState] = useState<"SAVED" | "DIRTY" | "SAVING" | "CONFLICT" | "ERROR">("SAVED");
  const [message, setMessage] = useState("");
  const [, startTransition] = useTransition();
  const [structureGroups, setStructureGroups] = useState(groups);
  const [structureUngrouped, setStructureUngrouped] = useState(ungrouped);
  const [branding, setBranding] = useState(page);
  const [liveVersion, setLiveVersion] = useState(publishedVersion);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [pendingBlockRemoval, setPendingBlockRemoval] = useState<{
    blockId: string;
    changes: string[];
    label: string;
    surface: PageSurfaceKey;
  } | null>(null);
  const [templatePreviewKey, setTemplatePreviewKey] = useState<PageTemplateKey>(initialDesign.templateKey);
  const [themePreviewKey, setThemePreviewKey] = useState<PageThemePresetKey>("DEFAULT");
  const [templatePreviewActive, setTemplatePreviewActive] = useState(false);
  const [themePreviewActive, setThemePreviewActive] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const compositionSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const selected = (() => {
    for (const zone of ZONES) {
      const block = design.surfaces[surface][zone.key].find((candidate) => candidate.id === selectedId);
      if (block) return { block, zone: zone.key };
    }
    return null;
  })();
  const previewDesign = (() => {
    const preview = templatePreviewActive
      ? templateDesign(templatePreviewKey, design.theme.palette.brand)
      : cloneDesign(design);
    if (templatePreviewActive) {
      preview.theme = structuredClone(design.theme);
      preview.seo = structuredClone(design.seo);
    }
    return themePreviewActive ? designWithThemePreset(preview, themePreviewKey) : preview;
  })();

  function commit(next: StatusPageDesign) {
    setDesign(next);
    setSaveState("DIRTY");
  }

  async function saveChanges(successMessage = "Changes saved") {
    if (saveState === "SAVING") return false;
    setSaveState("SAVING");
    setMessage("");
    const designToSave = cloneDesign(previewDesign);
    const result = await saveDesign(page.id, designToSave, revisionRef.current);
    if (result.ok) {
      setDesign(designToSave);
      setSavedDesign(cloneDesign(designToSave));
      setTemplatePreviewKey(designToSave.templateKey);
      setTemplatePreviewActive(false);
      setThemePreviewActive(false);
      if (!findDesignBlock(designToSave, surface, selectedId ?? "")) {
        const firstBlock = Object.values(designToSave.surfaces[surface]).flat()[0];
        setSelectedId(firstBlock?.id ?? null);
      }
      revisionRef.current = result.revision;
      setRevision(result.revision);
      setLiveVersion(result.liveVersion ?? liveVersion);
      setSaveState("SAVED");
      setMessage(result.unchanged ? "No changes to save" : `${successMessage}. Public page updated.`);
      router.refresh();
      return true;
    }
    setMessage(result.error);
    setSaveState(result.conflict ? "CONFLICT" : "ERROR");
    return false;
  }

  async function saveSupportingSections() {
    const brandingResult = await saveDesignerBranding(page.id, {
      name: branding.name,
      headline: branding.headline,
      aboutText: branding.aboutText,
      supportUrl: branding.supportUrl ?? "",
    });
    if (!brandingResult.ok) throw new Error(brandingResult.error);
    await reorderPageComponents(page.id, {
      groups: structureGroups.map((group) => ({ id: group.id, collapsed: group.collapsed })),
      components: [
        ...structureGroups.flatMap((group) => group.components.map((component) => ({ id: component.id, groupId: group.id }))),
        ...structureUngrouped.map((component) => ({ id: component.id, groupId: null })),
      ],
    });
  }

  async function saveEverything() {
    setMessage("");
    try {
      await saveSupportingSections();
      await saveChanges("All designer sections saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save all designer sections");
      setSaveState("ERROR");
    }
  }

  function addBlock(type: PageDesignBlock["type"]) {
    const next = cloneDesign(design);
    const alreadyAdded = Object.values(next.surfaces[surface]).flat().some((block) => block.type === type);
    if (alreadyAdded && !REPEATABLE_BLOCK_TYPES.has(type)) {
      setMessage(`${blockLabel(newBlock(type))} is already added to this surface`);
      return;
    }
    const block = newBlock(type);
    next.surfaces[surface].primary.push(block);
    commit(next);
    setSelectedId(block.id);
    setMessage(`${blockLabel(block)} added to the Primary zone`);
  }

  function compositionDragEnd(event: DragEndEvent) {
    if (!event.over) return;
    const activeId = String(event.active.id);
    const overId = String(event.over.id);
    const result = movePageDesignBlock(design, surface, activeId, overId);
    if (!result) return;
    commit(result.design);
    setSelectedId(activeId);
    setMessage(`${blockLabel(result.moved)} moved to ${ZONES.find((zone) => zone.key === result.targetZone)?.label}`);
  }

  function updateSelected(updater: (block: PageDesignBlock) => PageDesignBlock) {
    if (!selected) return;
    const next = cloneDesign(design);
    const blocks = next.surfaces[surface][selected.zone];
    const index = blocks.findIndex((block) => block.id === selected.block.id);
    blocks[index] = updater(blocks[index]);
    commit(next);
  }

  function moveSelected(zone: PageDesignZone) {
    if (!selected || selected.zone === zone) return;
    const next = cloneDesign(design);
    next.surfaces[surface][selected.zone] = next.surfaces[surface][selected.zone].filter((block) => block.id !== selected.block.id);
    next.surfaces[surface][zone].push(selected.block);
    commit(next);
  }

  function requestBlockRemoval(blockId: string) {
    const current = findDesignBlock(design, surface, blockId);
    if (!current) return;
    setPendingBlockRemoval({
      blockId,
      changes: describeBlockChanges(savedDesign, surface, current),
      label: blockLabel(current.block),
      surface,
    });
  }

  function confirmBlockRemoval() {
    if (!pendingBlockRemoval) return;
    const next = cloneDesign(design);
    const current = findDesignBlock(next, pendingBlockRemoval.surface, pendingBlockRemoval.blockId);
    if (!current) {
      setPendingBlockRemoval(null);
      return;
    }
    next.surfaces[pendingBlockRemoval.surface][current.zone] = next.surfaces[pendingBlockRemoval.surface][current.zone]
      .filter((block) => block.id !== pendingBlockRemoval.blockId);
    commit(next);
    if (selectedId === pendingBlockRemoval.blockId) setSelectedId(null);
    setMessage(`${pendingBlockRemoval.label} removed from the draft. Save all to update the public page.`);
    setPendingBlockRemoval(null);
  }

  function resetToDefaultDraft() {
    const next = templateDesign("CENTERED_SUMMARY");
    setResetDialogOpen(false);
    commit(next);
    setSurface("status");
    setSelectedId(next.surfaces.status.full[0]?.id ?? null);
    setTemplatePreviewKey("CENTERED_SUMMARY");
    setThemePreviewKey("DEFAULT");
    setTemplatePreviewActive(false);
    setThemePreviewActive(false);
    setMessage("Default design loaded locally. Review it, then Save all to update the public page.");
  }

  function updateTheme<Key extends keyof StatusPageDesign["theme"]>(key: Key, value: StatusPageDesign["theme"][Key]) {
    const next = cloneDesign(design);
    next.theme[key] = value;
    commit(next);
  }

  function updatePalette(key: keyof StatusPageDesign["theme"]["palette"], value: string) {
    const next = cloneDesign(design);
    next.theme.palette[key] = value;
    commit(next);
  }

  function importFile(file: File) {
    if (file.size > 100_000) {
      setMessage("Design files must be 100 KB or smaller");
      return;
    }
    void file.text().then((contents) => {
      try {
        const parsed = statusPageDesignSchema.parse(JSON.parse(contents));
        commit(parsed);
        setTemplatePreviewKey(parsed.templateKey);
        setTemplatePreviewActive(false);
        setThemePreviewActive(false);
        setSurface("status");
        setSelectedId(parsed.surfaces.status.full[0]?.id ?? null);
        setMessage("Design imported locally. Review it, then save to update the public page.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Invalid design file");
      }
    });
  }

  function restoreVersion(version: { version: number; design: StatusPageDesign }) {
    const restored = cloneDesign(version.design);
    commit(restored);
    setTemplatePreviewKey(restored.templateKey);
    setTemplatePreviewActive(false);
    setThemePreviewActive(false);
    setSurface("status");
    setSelectedId(restored.surfaces.status.full[0]?.id ?? null);
    setMessage(`Version ${version.version} loaded locally. Save to make it live.`);
  }

  function exportFile() {
    const blob = new Blob([JSON.stringify(design, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${page.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-status-design.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[var(--bg)]">
      <header className="z-40 flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-3">
        <Link href={`/organization/pages/${page.id}`} className="inline-flex min-h-9 items-center border border-[var(--line)] px-3 text-sm font-semibold hover:border-[var(--cyan)]">
          ← Back
        </Link>
        <div>
          <p className="text-xs uppercase tracking-wider text-[var(--fg-dim)]">Status-page designer</p>
          <h1 className="font-mono text-lg font-semibold">{page.name}</h1>
        </div>
        <span className={`ml-auto text-xs ${saveState === "ERROR" || saveState === "CONFLICT" ? "text-[var(--red)]" : "text-[var(--fg-dim)]"}`}>
          {saveState === "SAVING" ? "Saving…" : saveState === "DIRTY" ? "Unsaved changes" : saveState === "CONFLICT" ? "Editing conflict" : saveState === "ERROR" ? "Save failed" : `Draft r${revision}`}
        </span>
        <button type="button" data-button-guard="off" onClick={() => void saveEverything()} disabled={saveState === "SAVING" || saveState === "CONFLICT"} className="border border-[var(--cyan)] px-3 py-2 text-sm font-semibold text-[var(--cyan)] disabled:opacity-50">
          {saveState === "SAVING" ? "Saving…" : "Save all"}
        </button>
        <button type="button" onClick={() => startTransition(async () => {
          const result = await duplicateStatusPage(page.id);
          if (result.ok) location.href = `/organization/pages/${result.pageId}/design`;
        })} className="border border-[var(--line)] px-3 py-2 text-sm">Duplicate</button>
        <Button appearance="secondary" shape="square" type="button" data-button-busy-mode="interaction" onClick={() => setResetDialogOpen(true)}>
          Reset to default
        </Button>
        <Link
          href={page.publicPath}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-9 items-center border border-[var(--line)] px-3 text-sm font-semibold hover:border-[var(--cyan)]"
        >
          View live page ↗
        </Link>
      </header>

      <Dialog open={resetDialogOpen} onOpenChange={(_event, data) => setResetDialogOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Reset this design to default?</DialogTitle>
            <DialogContent className="space-y-3">
              <p>This will replace the current draft&apos;s visual layout, blocks, theme, header and footer configuration, SEO settings, and uptime presentation.</p>
              <p className="font-semibold">It will not delete the page, services, groups, incidents, subscribers, status history, or uploaded assets.</p>
              <p>The reset stays only in this browser until you choose Save all. Saving updates the public page immediately.</p>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setResetDialogOpen(false)}>Cancel</Button>
              <Button appearance="primary" onClick={() => void resetToDefaultDraft()}>Reset draft to default</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={pendingBlockRemoval !== null} onOpenChange={(_event, data) => { if (!data.open) setPendingBlockRemoval(null); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Remove {pendingBlockRemoval?.label}?</DialogTitle>
            <DialogContent className="space-y-3">
              {pendingBlockRemoval?.changes.length ? (
                <>
                  <p>This block has unsaved changes. Removing it will discard:</p>
                  <ul className="list-disc space-y-1 pl-5">
                    {pendingBlockRemoval.changes.map((change) => <li key={change}>{change}</li>)}
                  </ul>
                </>
              ) : (
                <p>This block has no unsaved changes.</p>
              )}
              <p>The removal stays in this draft until you choose Save all.</p>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setPendingBlockRemoval(null)}>Cancel</Button>
              <Button appearance="primary" onClick={confirmBlockRemoval}>Remove block</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {message && <div role="status" className="shrink-0 border-b border-[var(--line)] bg-[var(--cyan-soft)] px-4 py-2 text-sm">{message}</div>}
      {page.legacyCssActive && (
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--amber)]/30 bg-[var(--amber-soft)] px-4 py-3 text-sm text-[var(--amber)]">
          Legacy custom CSS is still applied to the live page and is frozen.
          <button type="button" onClick={() => startTransition(async () => { await resetLegacyCss(page.id); location.reload(); })} className="ml-auto underline">Reset legacy CSS</button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(16rem,42vh)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_minmax(24rem,36vw)] xl:grid-rows-1">
        <main className="row-start-2 min-h-0 min-w-0 overflow-y-auto overscroll-contain bg-[var(--bg)] xl:col-start-1 xl:row-start-1">
          <div className="mx-auto w-full max-w-7xl space-y-5 p-4 pb-10 lg:p-6 lg:pb-12">
            <section className="border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--fg-dim)]">Editing workspace</p>
                  <h2 className="mt-1 font-mono text-lg font-semibold">{SURFACES.find((item) => item.key === surface)?.label} page</h2>
                  <p className="mt-1 max-w-2xl text-xs text-[var(--fg-dim)]">Build the page in focused sections. The preview stays visible while this workspace scrolls.</p>
                </div>
                <div>
                  <PanelTitle>Portable design</PanelTitle>
                  <div className="flex gap-2">
                    <button type="button" data-button-guard="off" onClick={exportFile} className="border border-[var(--line)] px-3 py-2 text-xs hover:border-[var(--cyan)]">Export</button>
                    <label className="cursor-pointer border border-[var(--line)] px-3 py-2 text-xs hover:border-[var(--cyan)]">Import<input type="file" accept="application/json" className="sr-only" onChange={(event) => event.target.files?.[0] && importFile(event.target.files[0])} /></label>
                  </div>
                </div>
              </div>
            </section>

            <section className="border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="mb-4">
                <h2 className="font-mono text-sm font-semibold">Starting point</h2>
                <p className="mt-1 text-xs text-[var(--fg-dim)]">Layout and color system changes update the preview only. Your saved design stays unchanged.</p>
              </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <PanelTitle>Page template</PanelTitle>
                <Select
                  label="Layout"
                  value={templatePreviewKey}
                  onChange={(value) => {
                    setTemplatePreviewKey(value as PageTemplateKey);
                    setTemplatePreviewActive(true);
                    setSaveState("DIRTY");
                    setMessage("Template preview ready. Save all to update the public page.");
                  }}
                  options={[...PAGE_TEMPLATE_KEYS]}
                />
                <p className="mt-2 text-xs text-[var(--fg-dim)]">{PAGE_TEMPLATE_LABELS[templatePreviewKey]} changes page composition while preserving SEO and the selected theme.</p>
              </div>
              <div>
                <PanelTitle>Theme preset</PanelTitle>
                <Select
                  label="Color system"
                  value={themePreviewKey}
                  onChange={(value) => {
                    setThemePreviewKey(value as PageThemePresetKey);
                    setThemePreviewActive(true);
                    setSaveState("DIRTY");
                    setMessage("Theme preview ready. Save all to update the public page.");
                  }}
                  options={[...PAGE_THEME_PRESET_KEYS]}
                />
                <p className="mt-2 text-xs text-[var(--fg-dim)]">{PAGE_THEME_PRESET_DESCRIPTIONS[themePreviewKey]}</p>
              </div>
            </div>
            </section>

            <EditorSection id="composition" title="Page composition" description="Add blocks, then drag them within or between layout zones." open={expandedSection === "composition"} onToggle={setExpandedSection}>
              <div>
                <PanelTitle>Add block</PanelTitle>
                <div className="flex flex-wrap gap-1.5">
                  {BLOCK_LIBRARY.filter((item) => item.surfaces.includes(surface)).map((item) => (
                    (() => {
                      const matchingBlocks = Object.values(design.surfaces[surface]).flat().filter((block) => block.type === item.type);
                      const existingBlock = matchingBlocks[0];
                      const removeExisting = Boolean(existingBlock) && !REPEATABLE_BLOCK_TYPES.has(item.type);
                      return (
                        <button
                          key={item.type}
                          type="button"
                          data-button-busy-mode="interaction"
                          onClick={() => removeExisting ? requestBlockRemoval(existingBlock.id) : addBlock(item.type)}
                          aria-label={removeExisting ? `Remove ${item.label}` : `Add ${item.label}`}
                          className={`inline-flex items-center gap-2 border px-2.5 py-1.5 text-left text-xs ${removeExisting ? "border-[var(--red)]/40 text-[var(--red)] hover:border-[var(--red)]" : "border-[var(--line)] hover:border-[var(--cyan)]"}`}
                        >
                          {item.label}{REPEATABLE_BLOCK_TYPES.has(item.type) && matchingBlocks.length > 0 ? ` (${matchingBlocks.length})` : ""}
                          <span>{removeExisting ? "−" : "＋"}</span>
                        </button>
                      );
                    })()
                  ))}
                </div>
              </div>
              <DndContext sensors={compositionSensors} collisionDetection={closestCenter} onDragEnd={compositionDragEnd}>
                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  {ZONES.map((zone) => (
                    <SortableZone
                      key={zone.key}
                      zone={zone.key}
                      label={zone.label}
                      blocks={design.surfaces[surface][zone.key]}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                      onRemove={requestBlockRemoval}
                    />
                  ))}
                </div>
              </DndContext>
            </EditorSection>

            {selected && (
              <EditorSection id="block-settings" title={`${blockLabel(selected.block)} settings`} description="Configure the selected block without losing sight of the page preview." open={expandedSection === "block-settings"} onToggle={setExpandedSection}>
                <BlockInspector
                  block={selected.block}
                  zone={selected.zone}
                  onUpdate={updateSelected}
                  onMove={moveSelected}
                  onRemove={() => requestBlockRemoval(selected.block.id)}
                  onSave={() => void saveEverything()}
                />
              </EditorSection>
            )}

            <div className="grid items-start gap-5 2xl:grid-cols-2">
              <EditorSection id="branding" title="Branding and page details" description="Page identity, public copy, support link, and uploaded artwork." open={expandedSection === "branding"} onToggle={setExpandedSection}>
                <BrandingPanel
                  page={branding}
                  onChange={(next) => {
                    setBranding(next);
                    setSaveState("DIRTY");
                  }}
                  onSave={() => void saveEverything()}
                />
              </EditorSection>
              <EditorSection id="theme" title="Theme and appearance" description="Typography, spacing, shape, and brand colors." open={expandedSection === "theme"} onToggle={setExpandedSection}>
                <ThemePanel design={design} updateTheme={updateTheme} updatePalette={updatePalette} onSave={() => void saveEverything()} />
              </EditorSection>
              <EditorSection id="chrome" title="Header and footer" description="Navigation, visitor actions, footer links, and legal content." open={expandedSection === "chrome"} onToggle={setExpandedSection}>
                <ChromePanel design={design} onChange={commit} onSave={() => void saveEverything()} />
              </EditorSection>
              <EditorSection id="seo" title="Search and sharing" description="Search metadata, social image, and indexing controls." open={expandedSection === "seo"} onToggle={setExpandedSection}>
                <SeoPanel design={design} onChange={commit} onSave={() => void saveEverything()} />
              </EditorSection>
              <EditorSection id="announcements" title="Announcements" description="Create and manage public banners for incidents or maintenance." open={expandedSection === "announcements"} onToggle={setExpandedSection}>
                <AnnouncementPanel pageId={page.id} announcements={announcements} />
              </EditorSection>
              <EditorSection id="services" title="Services and groups" description="Organize how components appear in grouped directory layouts." open={expandedSection === "services"} onToggle={setExpandedSection}>
                <StructurePanel
                  pageId={page.id}
                  groups={structureGroups}
                  ungrouped={structureUngrouped}
                  onChange={(nextGroups, nextUngrouped) => {
                    setStructureGroups(nextGroups);
                    setStructureUngrouped(nextUngrouped);
                    setSaveState("DIRTY");
                  }}
                />
              </EditorSection>
            </div>

            <EditorSection id="versions" title="Saved versions" description="Review earlier saved designs and load one into the local draft." open={expandedSection === "versions"} onToggle={setExpandedSection}>
              <VersionPanel current={liveVersion} versions={versions} onRestore={restoreVersion} />
            </EditorSection>
          </div>
        </main>

        <aside className="row-start-1 flex min-h-0 flex-col overflow-hidden border-b border-[var(--line)] bg-[var(--surface)] xl:col-start-2 xl:row-start-1 xl:border-b-0 xl:border-l">
          <div className="shrink-0 border-b border-[var(--line)] p-3 lg:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--fg-dim)]">Live preview</p>
                <h2 className="font-mono text-sm font-semibold">{SURFACES.find((item) => item.key === surface)?.label} surface</h2>
              </div>
              <div className="flex gap-1" aria-label="Preview viewport">
                {(["DESKTOP", "TABLET", "MOBILE"] as const).map((size) => (
                  <button key={size} type="button" onClick={() => setViewport(size)} aria-pressed={viewport === size} className={`px-2 py-1 text-[10px] ${viewport === size ? "bg-[var(--cyan)] text-[var(--on-cyan)]" : "border border-[var(--line)]"}`}>
                    {size.slice(0, 1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1" aria-label="Preview surface">
              {SURFACES.map((item) => (
                <button key={item.key} type="button" onClick={() => { setSurface(item.key); setSelectedId(null); }} aria-pressed={surface === item.key} className={`px-2 py-1 text-[10px] ${surface === item.key ? "bg-[var(--cyan)] text-[var(--on-cyan)]" : "bg-[var(--surface-raised)]"}`}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div
            role="region"
            aria-label="Scrollable page preview"
            tabIndex={0}
            className="flex min-h-0 flex-1 items-start justify-center overflow-x-hidden overflow-y-auto overscroll-contain bg-[var(--surface-raised)] p-3 [scrollbar-gutter:stable] lg:p-4"
          >
            <div className={`w-full origin-top transition-[max-width] ${viewport === "MOBILE" ? "max-w-xs" : viewport === "TABLET" ? "max-w-xl" : "max-w-none"}`}>
              <DesignPreview page={branding} design={previewDesign} surface={surface} viewport={viewport} groups={structureGroups} ungrouped={structureUngrouped} />
            </div>
          </div>
          <div className="shrink-0 border-t border-[var(--line)] px-4 py-3 text-[10px] text-[var(--fg-dim)]">
            Changes stay local until Save all. Saving updates the public page immediately.
          </div>
        </aside>
      </div>
    </div>
  );
}

function EditorSection({
  id,
  title,
  description,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  description: string;
  open: boolean;
  onToggle: (id: string | null) => void;
  children: ReactNode;
}) {
  return (
    <section className="border border-[var(--line)] bg-[var(--surface)]">
      <button
        type="button"
        data-button-busy-mode="interaction"
        aria-expanded={open}
        aria-controls={`editor-section-${id}`}
        onClick={() => onToggle(open ? null : id)}
        className="flex w-full items-center gap-4 p-4 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-sm font-semibold">{title}</span>
          <span className="mt-1 block text-xs text-[var(--fg-dim)]">{description}</span>
        </span>
        <span aria-hidden="true" className={`text-lg text-[var(--fg-dim)] transition-transform ${open ? "rotate-45" : ""}`}>＋</span>
      </button>
      {open && <div id={`editor-section-${id}`} className="border-t border-[var(--line)] p-4">{children}</div>}
    </section>
  );
}

function BrandingPanel({
  page,
  onChange,
  onSave,
}: {
  page: EditorPage;
  onChange: (page: EditorPage) => void;
  onSave: () => void;
}) {
  const patch = (value: Partial<EditorPage>) => onChange({ ...page, ...value });
  return (
    <section>
      <div className="space-y-2">
        <Text label="Page name" value={page.name} onChange={(name) => patch({ name })} />
        <Text label="Headline" value={page.headline} onChange={(headline) => patch({ headline })} />
        <label className="block text-xs text-[var(--fg-soft)]">
          About text
          <textarea rows={4} value={page.aboutText} onChange={(event) => patch({ aboutText: event.target.value })} className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] p-2 text-[var(--fg)]" />
        </label>
        <Text label="Support URL" value={page.supportUrl ?? ""} onChange={(supportUrl) => patch({ supportUrl })} />
        <div className="grid grid-cols-3 gap-2 pt-1">
          {([
            ["Logo", page.logoUrl],
            ["Favicon", page.faviconUrl],
            ["Cover", page.coverImageUrl],
          ] as const).map(([label, url]) => (
            <div key={label} className="border border-[var(--line)] bg-[var(--bg)] p-2 text-center text-[10px] text-[var(--fg-dim)]">
              <div className="relative mb-1 h-12 overflow-hidden bg-[var(--surface-raised)]">
                {url ? <Image unoptimized src={url} alt={`${label} preview`} fill className="object-contain" /> : <span className="flex h-full items-center justify-center">None</span>}
              </div>
              {label}
            </div>
          ))}
        </div>
        <Link href={`/organization/pages/${page.id}/setup/logo`} className="inline-flex text-xs font-semibold text-[var(--cyan)] hover:underline">Manage uploaded images</Link>
      </div>
      <SectionSaveButton onClick={onSave}>Save branding and settings</SectionSaveButton>
    </section>
  );
}

function ChromePanel({ design, onChange, onSave }: { design: StatusPageDesign; onChange: (design: StatusPageDesign) => void; onSave: () => void }) {
  function updateHeader(mutator: (header: StatusPageDesign["chrome"]["header"]) => void) {
    const next = cloneDesign(design);
    mutator(next.chrome.header);
    onChange(next);
  }
  function updateFooter(mutator: (footer: StatusPageDesign["chrome"]["footer"]) => void) {
    const next = cloneDesign(design);
    mutator(next.chrome.footer);
    onChange(next);
  }
  return (
    <section>
      <Select label="Header style" value={design.chrome.header.variant} onChange={(value) => updateHeader((header) => { header.variant = value as StatusPageDesign["chrome"]["header"]["variant"]; })} options={["STANDARD", "CENTERED", "HERO", "MINIMAL"]} />
      <Check label="Sticky header" checked={design.chrome.header.sticky} onChange={(value) => updateHeader((header) => { header.sticky = value; })} />
      <p className="mb-1 mt-3 text-[10px] uppercase tracking-wider text-[var(--fg-dim)]">Header items</p>
      <div className="space-y-1">
        {design.chrome.header.items.map((item, index) => (
          item.type === "SUPPORT" ? null :
          <div key={item.id} className="flex items-center gap-1 border border-[var(--line)] px-2 py-1 text-xs">
            <input type="checkbox" checked={!item.hidden} onChange={(event) => updateHeader((header) => { header.items[index].hidden = !event.target.checked; })} />
            <span className="min-w-0 flex-1 truncate">{item.type.toLowerCase().replaceAll("_", " ")}</span>
            <button type="button" onClick={() => updateHeader((header) => { if (index > 0) header.items = arrayMove(header.items, index, index - 1); })}>↑</button>
            <button type="button" onClick={() => updateHeader((header) => { if (index < header.items.length - 1) header.items = arrayMove(header.items, index, index + 1); })}>↓</button>
          </div>
        ))}
      </div>
      <label className="mt-3 block text-xs">
        Navigation links <span className="text-[var(--fg-dim)]">(Label | https://…)</span>
        <textarea
          rows={3}
          value={design.chrome.header.links.map((link) => `${link.label} | ${link.url}`).join("\n")}
          onChange={(event) => updateHeader((header) => {
            header.links = parseLinks(event.target.value);
          })}
          className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] p-2"
        />
      </label>
      <Text label="Footer text" value={design.chrome.footer.customText} onChange={(value) => updateFooter((footer) => { footer.customText = value; })} />
      <label className="mt-3 block text-xs">
        Footer links <span className="text-[var(--fg-dim)]">(Label | https://…)</span>
        <textarea
          rows={3}
          value={design.chrome.footer.links.map((link) => `${link.label} | ${link.url}`).join("\n")}
          onChange={(event) => updateFooter((footer) => { footer.links = parseLinks(event.target.value); })}
          className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] p-2"
        />
      </label>
      <p className="mb-1 mt-3 text-[10px] uppercase tracking-wider text-[var(--fg-dim)]">Footer items</p>
      <div className="space-y-1">
        {design.chrome.footer.items.map((item, index) => (
          <div key={item.id} className="flex items-center gap-1 border border-[var(--line)] px-2 py-1 text-xs">
            <input type="checkbox" checked={!item.hidden} onChange={(event) => updateFooter((footer) => { footer.items[index].hidden = !event.target.checked; })} />
            <span className="min-w-0 flex-1 truncate">{item.type.toLowerCase().replaceAll("_", " ")}</span>
            <button type="button" onClick={() => updateFooter((footer) => { if (index > 0) footer.items = arrayMove(footer.items, index, index - 1); })}>↑</button>
            <button type="button" onClick={() => updateFooter((footer) => { if (index < footer.items.length - 1) footer.items = arrayMove(footer.items, index, index + 1); })}>↓</button>
          </div>
        ))}
      </div>
      <SectionSaveButton onClick={onSave}>Save header and footer</SectionSaveButton>
    </section>
  );
}

function parseLinks(value: string) {
  return value
    .split("\n")
    .map((line) => line.split("|").map((part) => part.trim()))
    .filter((parts) => parts.length === 2 && parts[0] && /^https?:\/\//.test(parts[1]))
    .map(([label, url]) => ({ label: label.slice(0, 80), url }));
}

function SeoPanel({ design, onChange, onSave }: { design: StatusPageDesign; onChange: (design: StatusPageDesign) => void; onSave: () => void }) {
  function update(key: keyof StatusPageDesign["seo"], value: string | boolean | null) {
    const next = cloneDesign(design);
    if (key === "noIndex") next.seo.noIndex = Boolean(value);
    else if (key === "socialImageUrl") next.seo.socialImageUrl = typeof value === "string" && value ? value : null;
    else if (key === "title") next.seo.title = String(value);
    else next.seo.description = String(value);
    onChange(next);
  }
  return (
    <section>
      <div className="space-y-2">
        <Text label="SEO title" value={design.seo.title} onChange={(value) => update("title", value)} />
        <label className="block text-xs">Description<textarea rows={3} value={design.seo.description} onChange={(event) => update("description", event.target.value)} className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] p-2" /></label>
        <Text label="Social image URL" value={design.seo.socialImageUrl ?? ""} onChange={(value) => update("socialImageUrl", value)} />
        <Check label="Hide from search engines" checked={design.seo.noIndex} onChange={(value) => update("noIndex", value)} />
      </div>
      <SectionSaveButton onClick={onSave}>Save search settings</SectionSaveButton>
    </section>
  );
}

function SortableZone({
  zone,
  label,
  blocks,
  selectedId,
  onSelect,
  onRemove,
}: {
  zone: PageDesignZone;
  label: string;
  blocks: PageDesignBlock[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `zone-${zone}` });
  return (
    <section ref={setNodeRef} className={`min-h-36 border border-dashed bg-[var(--surface)] p-3 transition-colors ${isOver ? "border-[var(--cyan)] bg-[var(--cyan-soft)]" : "border-[var(--line-bright)]"}`}>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--fg-dim)]">{label}</h3>
      <SortableContext items={blocks.map((block) => block.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {blocks.map((block) => <SortableBlock key={block.id} block={block} selected={block.id === selectedId} onSelect={() => onSelect(block.id)} onRemove={() => onRemove(block.id)} />)}
          {!blocks.length && <p className="py-6 text-center text-xs text-[var(--fg-dim)]">Drop a block here</p>}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableBlock({ block, selected, onSelect, onRemove }: { block: PageDesignBlock; selected: boolean; onSelect: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex w-full items-center gap-2 border px-3 py-2 text-left text-sm ${selected ? "border-[var(--cyan)] bg-[var(--cyan-soft)]" : "border-[var(--line)]"} ${isDragging ? "opacity-50" : ""}`}
    >
      <button type="button" data-button-guard="off" {...attributes} {...listeners} className="cursor-grab text-[var(--fg-dim)]" aria-label={`Reorder ${blockLabel(block)}`}>⠿</button>
      <button type="button" data-button-guard="off" onClick={onSelect} className="min-w-0 flex-1 text-left">{blockLabel(block)}</button>
      {block.hidden && <span className="text-xs text-[var(--fg-dim)]">Hidden</span>}
      <button type="button" data-button-busy-mode="interaction" onClick={onRemove} aria-label={`Remove ${blockLabel(block)}`} className="px-1 text-base text-[var(--red)]" title={`Remove ${blockLabel(block)}`}>−</button>
    </div>
  );
}

function ThemePanel({
  design,
  updateTheme,
  updatePalette,
  onSave,
}: {
  design: StatusPageDesign;
  updateTheme: <Key extends keyof StatusPageDesign["theme"]>(key: Key, value: StatusPageDesign["theme"][Key]) => void;
  updatePalette: (key: keyof StatusPageDesign["theme"]["palette"], value: string) => void;
  onSave: () => void;
}) {
  return (
    <section>
      <div className="grid grid-cols-2 gap-2">
        <Select label="Mode" value={design.theme.mode} onChange={(value) => updateTheme("mode", value as StatusPageDesign["theme"]["mode"])} options={["SYSTEM", "LIGHT", "DARK"]} />
        <Select label="Type" value={design.theme.typography} onChange={(value) => updateTheme("typography", value as StatusPageDesign["theme"]["typography"])} options={["SYSTEM", "HUMANIST", "GEOMETRIC", "MONO"]} />
        <Select label="Density" value={design.theme.density} onChange={(value) => updateTheme("density", value as StatusPageDesign["theme"]["density"])} options={["COMPACT", "COMFORTABLE", "SPACIOUS"]} />
        <Select label="Width" value={design.theme.contentWidth} onChange={(value) => updateTheme("contentWidth", value as StatusPageDesign["theme"]["contentWidth"])} options={["NARROW", "STANDARD", "WIDE"]} />
        <Select label="Radius" value={design.theme.radius} onChange={(value) => updateTheme("radius", value as StatusPageDesign["theme"]["radius"])} options={["NONE", "SMALL", "MEDIUM", "LARGE"]} />
        <Select label="Shadow" value={design.theme.shadow} onChange={(value) => updateTheme("shadow", value as StatusPageDesign["theme"]["shadow"])} options={["NONE", "SUBTLE", "ELEVATED"]} />
      </div>
      <label className="mt-3 flex items-center gap-2 text-xs">
        <input type="checkbox" checked={design.theme.allowVisitorMode} onChange={(event) => updateTheme("allowVisitorMode", event.target.checked)} />
        Let visitors switch light/dark
      </label>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {(["brand", "background", "surface", "text"] as const).map((key) => (
          <label key={key} title={key} className="text-[10px] capitalize text-[var(--fg-dim)]">
            <input type="color" value={design.theme.palette[key]} onChange={(event) => updatePalette(key, event.target.value)} className="h-8 w-full border-0 bg-transparent" />
            {key.replace(/([A-Z])/g, " $1")}
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs text-[var(--fg-dim)]">
        Operational, degraded, outage, and maintenance colors use the standard SignalHub severity palette.
      </p>
      <SectionSaveButton onClick={onSave}>Save theme</SectionSaveButton>
    </section>
  );
}

function BlockInspector({
  block,
  zone,
  onUpdate,
  onMove,
  onRemove,
  onSave,
}: {
  block: PageDesignBlock;
  zone: PageDesignZone;
  onUpdate: (updater: (block: PageDesignBlock) => PageDesignBlock) => void;
  onMove: (zone: PageDesignZone) => void;
  onRemove: () => void;
  onSave: () => void;
}) {
  function patchSettings(settings: Record<string, unknown>) {
    onUpdate((current) => ({ ...current, settings: { ...current.settings, ...settings } } as PageDesignBlock));
  }
  return (
    <section>
      <Select label="Zone" value={zone} onChange={(value) => onMove(value as PageDesignZone)} options={["full", "primary", "sidebar"]} />
      <label className="mt-3 flex items-center gap-2 text-xs">
        <input type="checkbox" checked={!block.hidden} onChange={(event) => onUpdate((current) => ({ ...current, hidden: !event.target.checked }))} />
        Visible
      </label>
      {block.type === "OVERALL_STATUS" && (
        <div className="mt-3 space-y-2">
          <Select label="Style" value={block.settings.style} onChange={(value) => patchSettings({ style: value })} options={["PANEL", "SOLID", "CENTERED", "COMPACT"]} />
          <Check label="Show last updated" checked={block.settings.showLastUpdated} onChange={(value) => patchSettings({ showLastUpdated: value })} />
          <Check label="Show page description" checked={block.settings.showDescription} onChange={(value) => patchSettings({ showDescription: value })} />
        </div>
      )}
      {block.type === "COMPONENT_STATUS" && (
        <div className="mt-3 space-y-2">
          <Select label="Presentation" value={block.settings.view} onChange={(value) => patchSettings({ view: value })} options={["LIST", "CARDS", "GRID", "COMPACT", "UPTIME"]} />
          <Check label="Group services" checked={block.settings.groupingEnabled} onChange={(value) => patchSettings({ groupingEnabled: value })} />
          {block.settings.groupingEnabled && <Select label="Group style" value={block.settings.groupStyle} onChange={(value) => patchSettings({ groupStyle: value })} options={["ACCORDION", "SECTIONS", "CARDS"]} />}
          <Select label="Service style" value={block.settings.componentStyle} onChange={(value) => patchSettings({ componentStyle: value })} options={["ROWS", "PILLS"]} />
          {block.settings.componentStyle === "PILLS" && <Select label="Service columns" value={String(block.settings.componentColumns)} onChange={(value) => patchSettings({ componentColumns: Number(value) })} options={["1", "2", "3"]} />}
          <Select label="Uptime window" value={String(block.settings.uptimeDays)} onChange={(value) => patchSettings({ uptimeDays: Number(value) })} options={["30", "60", "90"]} />
          <Select label="Uptime line style" value={block.settings.uptimeStyle} onChange={(value) => patchSettings({ uptimeStyle: value })} options={[...UPTIME_BAR_STYLES]} />
          <Select label="Uptime segment size" value={block.settings.uptimeSize} onChange={(value) => patchSettings({ uptimeSize: value })} options={[...UPTIME_BAR_SIZES]} />
          <Select label="Uptime segment icon" value={block.settings.uptimeIcon} onChange={(value) => patchSettings({ uptimeIcon: value })} options={[...UPTIME_ICON_STYLES]} />
          <Check label="Show uptime" checked={block.settings.showUptime} onChange={(value) => patchSettings({ showUptime: value })} />
          <Check label="Show descriptions" checked={block.settings.showDescriptions} onChange={(value) => patchSettings({ showDescriptions: value })} />
          <Check label="Show legend" checked={block.settings.showLegend} onChange={(value) => patchSettings({ showLegend: value })} />
          <Check label="Show service summary" checked={block.settings.showSummary} onChange={(value) => patchSettings({ showSummary: value })} />
          <Check label="Enable search" checked={block.settings.searchEnabled} onChange={(value) => patchSettings({ searchEnabled: value })} />
        </div>
      )}
      {block.type === "RICH_TEXT" && (
        <div className="mt-3 space-y-2">
          <Text label="Heading" value={block.settings.heading} onChange={(value) => patchSettings({ heading: value })} />
          <label className="block text-xs">Body<textarea value={block.settings.body} onChange={(event) => patchSettings({ body: event.target.value })} rows={5} className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] p-2" /></label>
          <Select label="Alignment" value={block.settings.align} onChange={(value) => patchSettings({ align: value })} options={["LEFT", "CENTER"]} />
        </div>
      )}
      {"heading" in block.settings && block.type !== "RICH_TEXT" && block.type !== "SUBSCRIBE" && (
        <div className="mt-3"><Text label="Heading" value={String(block.settings.heading)} onChange={(value) => patchSettings({ heading: value })} /></div>
      )}
      {block.type === "SUBSCRIBE" && (
        <div className="mt-3 space-y-2">
          <Text label="Heading" value={block.settings.heading} onChange={(value) => patchSettings({ heading: value })} />
          <Select label="Style" value={block.settings.style} onChange={(value) => patchSettings({ style: value })} options={["BUTTON", "PANEL", "INLINE"]} />
        </div>
      )}
      <SectionSaveButton onClick={onSave}>Save block</SectionSaveButton>
      <button type="button" data-button-busy-mode="interaction" onClick={onRemove} className="mt-4 text-xs text-[var(--red)] underline">Remove block</button>
    </section>
  );
}

function DesignPreview({
  page,
  design,
  surface,
  viewport,
  groups,
  ungrouped,
}: {
  page: EditorPage;
  design: StatusPageDesign;
  surface: PageSurfaceKey;
  viewport: "DESKTOP" | "TABLET" | "MOBILE";
  groups: StructureGroup[];
  ungrouped: Array<{ id: string; name: string }>;
}) {
  const palette = design.theme.mode === "DARK"
    ? { ...design.theme.palette, ...design.theme.darkPalette }
    : design.theme.palette;
  const configuration = design.surfaces[surface];
  const sidebarVisible = configuration.sidebar.some((block) => !block.hidden);
  return (
    <div
      className="overflow-hidden border border-[var(--line)] transition-all"
      style={{
        background: palette.background,
        color: palette.text,
        borderRadius: design.theme.radius === "NONE" ? 0 : design.theme.radius === "LARGE" ? 18 : 10,
        minHeight: viewport === "MOBILE" ? 540 : 460,
      }}
    >
      <div className={`flex items-center gap-3 border-b px-5 py-4 ${design.chrome.header.variant === "CENTERED" ? "justify-center" : ""}`} style={{ background: palette.surface, borderColor: `${palette.mutedText}30` }}>
        {page.logoUrl ? (
          <span className="relative h-9 w-24"><Image unoptimized src={page.logoUrl} alt="" fill className="object-contain object-left" /></span>
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-md text-white" style={{ background: palette.brand }}>{page.name.slice(0, 1)}</span>
        )}
        <strong>{page.name}</strong>
        {design.chrome.header.items.some((item) => item.type === "SUBSCRIBE" && !item.hidden) && (
          <span className="ml-auto text-xs" style={{ color: palette.mutedText }}>Subscribe</span>
        )}
      </div>
      {design.chrome.header.variant === "HERO" && (
        <div
          className="h-28 bg-[var(--surface-raised)] opacity-90"
          style={page.coverImageUrl
            ? coverImageStyle(
                page.coverImageUrl,
                {
                  fit: page.coverImageFit,
                  positionX: page.coverImagePositionX,
                  positionY: page.coverImagePositionY,
                  cropX: page.coverImageCropX,
                  cropY: page.coverImageCropY,
                  cropWidth: page.coverImageCropWidth,
                  cropHeight: page.coverImageCropHeight,
                },
                `linear-gradient(120deg, ${palette.brand}99, ${palette.accent}99)`
              )
            : { backgroundImage: `linear-gradient(120deg, ${palette.brand}, ${palette.accent})` }}
        />
      )}
      <div className="mx-auto max-w-4xl space-y-4 p-5">
        <div>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: palette.mutedText }}>{SURFACES.find((candidate) => candidate.key === surface)?.label} surface</p>
          <h2 className="text-xl font-semibold">{surface === "status" ? page.headline || "Service status" : `${page.name} ${surface}`}</h2>
          {surface === "status" && page.aboutText && <p className="mt-1 text-xs" style={{ color: palette.mutedText }}>{page.aboutText}</p>}
        </div>
        <div className="space-y-3">
          {configuration.full.filter((block) => !block.hidden).map((block) => (
            <PreviewBlock key={block.id} block={block} palette={palette} viewport={viewport} groups={groups} ungrouped={ungrouped} />
          ))}
        </div>
        {(configuration.primary.length > 0 || configuration.sidebar.length > 0) && (
          <div className={`grid gap-3 ${viewport !== "MOBILE" && sidebarVisible ? "grid-cols-[minmax(0,2fr)_minmax(12rem,1fr)]" : ""}`}>
            <div className="space-y-3">
              {configuration.primary.filter((block) => !block.hidden).map((block) => (
                <PreviewBlock key={block.id} block={block} palette={palette} viewport={viewport} groups={groups} ungrouped={ungrouped} />
              ))}
            </div>
            <div className="space-y-3">
              {configuration.sidebar.filter((block) => !block.hidden).map((block) => (
                <PreviewBlock key={block.id} block={block} palette={palette} viewport={viewport} groups={groups} ungrouped={ungrouped} />
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="border-t px-5 py-4 text-[10px]" style={{ borderColor: `${palette.mutedText}30`, color: palette.mutedText }}>
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          {design.chrome.footer.items.filter((item) => !item.hidden).map((item) => {
            if (item.type === "CUSTOM_TEXT" && design.chrome.footer.customText) {
              return <span key={item.id}>{design.chrome.footer.customText}</span>;
            }
            if (item.type === "LINKS" && design.chrome.footer.links.length) {
              return <span key={item.id} className="flex flex-wrap gap-3">{design.chrome.footer.links.map((link) => <span key={link.url}>{link.label}</span>)}</span>;
            }
            if (item.type === "LEGAL" && page.supportUrl) return <span key={item.id}>Support</span>;
            if (item.type === "BRANDING") return <span key={item.id}>Powered by SignalHub</span>;
            if (item.type === "COPYRIGHT") return <span key={item.id}>© {new Date().getFullYear()}</span>;
            return null;
          })}
        </div>
      </div>
    </div>
  );
}

function PreviewBlock({
  block,
  palette,
  viewport,
  groups,
  ungrouped,
}: {
  block: PageDesignBlock;
  palette: StatusPageDesign["theme"]["palette"];
  viewport: "DESKTOP" | "TABLET" | "MOBILE";
  groups: StructureGroup[];
  ungrouped: Array<{ id: string; name: string }>;
}) {
  const panelStyle = { background: palette.surface, borderColor: `${palette.mutedText}30` };
  if (block.type === "OVERALL_STATUS") {
    const solid = block.settings.style === "SOLID";
    return (
      <div className={`border p-4 ${block.settings.style === "CENTERED" ? "text-center" : ""}`} style={{ ...panelStyle, borderColor: STANDARD_STATUS_COLORS.operational, background: solid ? STANDARD_STATUS_COLORS.operational : palette.surface }}>
        <strong style={{ color: solid ? "#ffffff" : STANDARD_STATUS_COLORS.operational }}>✓ All Systems Operational</strong>
        {block.settings.showDescription && <p className="mt-1 text-xs" style={{ color: solid ? "#ffffffcc" : palette.mutedText }}>No known issues are affecting services.</p>}
      </div>
    );
  }
  if (block.type === "COMPONENT_STATUS") {
    const grid = viewport !== "MOBILE" && ["GRID", "CARDS"].includes(block.settings.view);
    const configuredGroups = [
      ...groups,
      ...(ungrouped.length
        ? [{ id: "ungrouped", name: groups.length ? "Other services" : "Services", collapsed: false, components: ungrouped }]
        : []),
    ];
    const serviceCount = configuredGroups.reduce((total, group) => total + group.components.length, 0);
    const previewGroups = block.settings.groupingEnabled
      ? configuredGroups
      : serviceCount
        ? [{ id: "flat-services", name: "", collapsed: false, components: configuredGroups.flatMap((group) => group.components) }]
        : [];
    const pillColumns = viewport === "MOBILE"
      ? "grid-cols-1"
      : block.settings.componentColumns === 3
        ? "grid-cols-3"
        : block.settings.componentColumns === 2
          ? "grid-cols-2"
          : "grid-cols-1";
    return (
      <div className="space-y-3">
        {block.settings.showSummary && (
          <div className={`grid gap-2 ${viewport === "MOBILE" ? "grid-cols-2" : "grid-cols-5"}`}>
            {[
              ["Total Services", serviceCount, palette.text],
              ["Operational", serviceCount, STANDARD_STATUS_COLORS.operational],
              ["Degraded", 0, STANDARD_STATUS_COLORS.degraded],
              ["Offline", 0, STANDARD_STATUS_COLORS.majorOutage],
              ["Maintenance", 0, STANDARD_STATUS_COLORS.maintenance],
            ].map(([label, count, color], index) => (
              <div key={String(label)} className="border p-2 text-center" style={{ ...panelStyle, borderColor: index === 0 ? palette.brand : `${palette.mutedText}30` }}>
                <div className="text-[9px]" style={{ color: palette.mutedText }}>{label}</div>
                <strong className="text-lg" style={{ color: String(color) }}>{count}</strong>
              </div>
            ))}
          </div>
        )}
        {block.settings.searchEnabled && (
          <div className="flex items-center gap-2 border px-3 py-2 text-xs" style={panelStyle}>
            <span aria-hidden="true" style={{ color: palette.mutedText }}>⌕</span>
            <span style={{ color: palette.mutedText }}>Search services</span>
          </div>
        )}
        <div className={`grid gap-2 ${grid ? "grid-cols-2" : ""}`}>
          {previewGroups.map((group) => (
            <section key={group.id} className="overflow-hidden border" style={panelStyle}>
              {block.settings.groupingEnabled && (
                <div className="flex items-center justify-between gap-2 p-3 text-xs">
                  <strong>{group.name}</strong>
                  <span className="flex items-center gap-2" style={{ color: palette.mutedText }}>
                    {group.components.length} {group.components.length === 1 ? "service" : "services"}
                    {block.settings.groupStyle === "ACCORDION" && <span aria-hidden="true">⌄</span>}
                  </span>
                </div>
              )}
              {!(block.settings.groupingEnabled && block.settings.groupStyle === "ACCORDION" && group.collapsed) && (
                <div className={`${block.settings.groupingEnabled ? "border-t" : ""} p-3`} style={{ borderColor: `${palette.mutedText}20` }}>
                  <div className={block.settings.componentStyle === "PILLS" ? `grid gap-2 ${pillColumns}` : "divide-y"}>
                    {group.components.map((component) => (
                      block.settings.componentStyle === "PILLS" ? (
                        <div key={component.id} className="flex items-center gap-2 rounded-full border px-2 py-1.5 text-[10px]" style={{ borderColor: `${palette.mutedText}30` }}>
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full" style={{ background: `${STANDARD_STATUS_COLORS.operational}18`, color: STANDARD_STATUS_COLORS.operational }}>✓</span>
                          <span className="min-w-0 flex-1 truncate">{component.name}</span>
                          <span style={{ color: palette.mutedText }}>＋</span>
                        </div>
                      ) : (
                        <div key={component.id} className="py-2">
                          <div className="flex justify-between gap-2 text-xs"><span>{component.name}</span><span style={{ color: STANDARD_STATUS_COLORS.operational }}>Operational</span></div>
                          {block.settings.showUptime && (
                            <>
                            <div
                              data-uptime-style={block.settings.uptimeStyle}
                              data-uptime-size={block.settings.uptimeSize}
                              data-uptime-icon={block.settings.uptimeIcon}
                              className={`mt-2 flex overflow-hidden ${block.settings.uptimeStyle === "SOLID" ? "gap-0" : block.settings.uptimeSize === "RESPONSIVE" ? "gap-1" : "gap-0.5"}`}
                            >
                              {Array.from({ length: viewport === "MOBILE" ? 18 : 34 }, (_, day) => (
                                <span
                                  key={day}
                                  className={`inline-flex shrink-0 items-center justify-center text-[6px] font-bold text-white ${
                                    block.settings.uptimeSize === "BLOCKS"
                                      ? "h-5 w-5"
                                      : block.settings.uptimeSize === "COMPACT"
                                        ? "h-4 w-1"
                                        : "h-8 min-w-0 flex-1"
                                  } ${
                                    block.settings.uptimeStyle === "PILL"
                                      ? "rounded-full"
                                      : block.settings.uptimeStyle === "ROUNDED"
                                        ? "rounded-sm"
                                        : "rounded-none"
                                  }`}
                                  style={{ background: STANDARD_STATUS_COLORS.operational }}
                                >
                                  {block.settings.uptimeIcon === "STATUS" ? "✓" : block.settings.uptimeIcon === "DOT" ? "•" : ""}
                                </span>
                              ))}
                            </div>
                            <div className="mt-1 grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-2 text-[7px]" style={{ color: palette.mutedText }}>
                              <span>{block.settings.uptimeDays} days ago</span><span className="h-px" style={{ background: `${palette.mutedText}50` }} /><span>100% uptime</span><span className="h-px" style={{ background: `${palette.mutedText}50` }} /><span>Today</span>
                            </div>
                            </>
                          )}
                        </div>
                      )
                    ))}
                  </div>
                </div>
              )}
            </section>
          ))}
          {!previewGroups.length && <div className="border p-4 text-xs" style={panelStyle}>No component groups or components have been created yet.</div>}
        </div>
      </div>
    );
  }
  if (block.type === "HUB_GRID") {
    return (
      <div className={`grid gap-2 ${viewport !== "MOBILE" && block.settings.columns > 1 ? "grid-cols-2" : ""}`}>
        {["Payments", "Developer API", "Dashboard", "Support"].slice(0, block.settings.columns === 1 ? 2 : 4).map((name) => (
          <div key={name} className="border p-3 text-xs" style={panelStyle}>
            <div className="flex justify-between"><strong>{name}</strong><span style={{ color: STANDARD_STATUS_COLORS.operational }}>Operational</span></div>
          </div>
        ))}
      </div>
    );
  }
  if (block.type === "ANNOUNCEMENTS") {
    return <div className="border p-3 text-xs" style={{ ...panelStyle, borderColor: STANDARD_STATUS_COLORS.maintenance }}><strong>Scheduled announcement</strong><p style={{ color: palette.mutedText }}>Updates and maintenance notices appear here.</p></div>;
  }
  if (block.type === "RICH_TEXT") {
    return <div className={`border p-3 text-xs ${block.settings.align === "CENTER" ? "text-center" : ""}`} style={panelStyle}><strong>{block.settings.heading || "Custom text"}</strong><p className="mt-1" style={{ color: palette.mutedText }}>{block.settings.body || "Add fully customizable content here."}</p></div>;
  }
  const heading = "heading" in block.settings ? String(block.settings.heading) : blockLabel(block);
  return (
    <div className="border p-3 text-xs" style={panelStyle}>
      <strong>{heading}</strong>
      <div className="mt-2 space-y-1">
        <span className="block h-2 w-full opacity-20" style={{ background: palette.mutedText }} />
        <span className="block h-2 w-3/4 opacity-20" style={{ background: palette.mutedText }} />
      </div>
    </div>
  );
}

function AnnouncementPanel({ pageId, announcements }: { pageId: string; announcements: EditorAnnouncement[] }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<EditorAnnouncement["severity"]>("INFO");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [startsAt, setStartsAt] = useState(() => toLocalDateTimeInput(new Date()));
  const [endsAt, setEndsAt] = useState("");
  const [dismissible, setDismissible] = useState(false);
  const [priority, setPriority] = useState("0");
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <section>
      <div className="space-y-2">
        {announcements.slice(0, 4).map((announcement) => (
          <div key={announcement.id} className="flex items-start gap-2 border border-[var(--line)] p-2 text-xs">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate font-medium">{announcement.title}</span>
                <span className="border border-[var(--line)] px-1 text-[10px] uppercase text-[var(--fg-dim)]">{announcement.severity}</span>
              </div>
              <p className="mt-1 text-[10px] text-[var(--fg-dim)]">
                {new Date(announcement.startsAt).toLocaleString()}
                {announcement.endsAt ? ` – ${new Date(announcement.endsAt).toLocaleString()}` : " – no end"}
              </p>
            </div>
            <button type="button" disabled={pending} onClick={() => startTransition(async () => { await deleteAnnouncement(pageId, announcement.id); location.reload(); })} className="text-[var(--red)]">×</button>
          </div>
        ))}
      </div>
      <button type="button" data-button-busy-mode="interaction" onClick={() => setExpanded((value) => !value)} className="mt-3 text-xs underline">
        {expanded ? "Close composer" : "Create announcement"}
      </button>
      {expanded && (
        <div className="mt-3 space-y-3 border border-[var(--line)] bg-[var(--surface)] p-3">
          <Text label="Title" value={title} onChange={setTitle} />
          <label className="block text-xs">
            Message
            <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={3} className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] p-2" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Select label="Severity" value={severity} onChange={(value) => setSeverity(value as EditorAnnouncement["severity"])} options={["INFO", "SUCCESS", "WARNING", "CRITICAL"]} />
            <label className="block text-xs">
              Priority
              <input type="number" min="-100" max="100" value={priority} onChange={(event) => setPriority(event.target.value)} className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs">
              Starts
              <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5" />
            </label>
            <label className="block text-xs">
              Ends (optional)
              <input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Text label="CTA label" value={ctaLabel} onChange={setCtaLabel} />
            <Text label="CTA URL" value={ctaUrl} onChange={setCtaUrl} />
          </div>
          <Check label="Visitors can dismiss this announcement" checked={dismissible} onChange={setDismissible} />
          {error && <p className="text-xs text-[var(--red)]">{error}</p>}
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!title.trim() || !startsAt || pending}
              onClick={() => startTransition(async () => {
                setError("");
                try {
                  await createAnnouncement(pageId, {
                    title,
                    body,
                    severity,
                    ctaLabel: ctaLabel || undefined,
                    ctaUrl: ctaUrl || undefined,
                    startsAt: new Date(startsAt).toISOString(),
                    endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
                    dismissible,
                    priority: Number(priority) || 0,
                  });
                  location.reload();
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : "Could not create announcement");
                }
              })}
              className="border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-xs font-medium"
            >
              {pending ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      )}
      {!announcements.length && !expanded && (
        <p className="mt-2 text-xs text-[var(--fg-dim)]">Schedule banners for incidents, maintenance, or general notices.</p>
      )}
    </section>
  );
}

function toLocalDateTimeInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function StructurePanel({
  pageId,
  groups,
  ungrouped,
  onChange,
}: {
  pageId: string;
  groups: StructureGroup[];
  ungrouped: Array<{ id: string; name: string }>;
  onChange: (groups: StructureGroup[], ungrouped: Array<{ id: string; name: string }>) => void;
}) {
  const [saving, startTransition] = useTransition();
  const [status, setStatus] = useState("");
  function moveGroup(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= groups.length) return;
    onChange(arrayMove(groups, index, target), ungrouped);
  }
  function moveComponent(sourceGroupId: string | null, componentId: string, targetGroupId: string | null, offset = 0) {
    const nextGroups = groups.map((group) => ({ ...group, components: [...group.components] }));
    let nextUngrouped = [...ungrouped];
    const source = sourceGroupId ? nextGroups.find((group) => group.id === sourceGroupId)?.components : nextUngrouped;
    if (!source) return;
    const sourceIndex = source.findIndex((component) => component.id === componentId);
    if (sourceIndex < 0) return;
    if (sourceGroupId === targetGroupId) {
      const targetIndex = sourceIndex + offset;
      if (targetIndex < 0 || targetIndex >= source.length) return;
      const moved = arrayMove(source, sourceIndex, targetIndex);
      if (sourceGroupId) nextGroups.find((group) => group.id === sourceGroupId)!.components = moved;
      else nextUngrouped = moved;
    } else {
      const [component] = source.splice(sourceIndex, 1);
      const target = targetGroupId ? nextGroups.find((group) => group.id === targetGroupId)?.components : nextUngrouped;
      if (!target) return;
      target.push(component);
    }
    onChange(nextGroups, nextUngrouped);
  }
  function save() {
    startTransition(async () => {
      setStatus("");
      try {
        await reorderPageComponents(pageId, {
          groups: groups.map((group) => ({ id: group.id, collapsed: group.collapsed })),
          components: [
            ...groups.flatMap((group) => group.components.map((component) => ({ id: component.id, groupId: group.id }))),
            ...ungrouped.map((component) => ({ id: component.id, groupId: null })),
          ],
        });
        setStatus("Component groups and order saved");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Could not save component structure");
      }
    });
  }
  return (
    <section>
      <div className="space-y-1">
        {groups.map((group, index) => (
          <div key={group.id} className="border border-[var(--line)] p-2 text-xs">
            <div className="flex items-center gap-1">
              <span className="min-w-0 flex-1 truncate font-semibold">{group.name} · {group.components.length}</span>
              <label className="flex items-center gap-1 text-[10px] text-[var(--fg-dim)]"><input type="checkbox" checked={group.collapsed} onChange={(event) => onChange(groups.map((candidate) => candidate.id === group.id ? { ...candidate, collapsed: event.target.checked } : candidate), ungrouped)} />Collapsed</label>
              <button type="button" onClick={() => moveGroup(index, -1)} aria-label={`Move ${group.name} up`}>↑</button>
              <button type="button" onClick={() => moveGroup(index, 1)} aria-label={`Move ${group.name} down`}>↓</button>
            </div>
            {group.components.map((component, componentIndex) => (
              <div key={component.id} className="mt-1 flex items-center gap-1 bg-[var(--bg)] px-1.5 py-1">
                <span className="min-w-0 flex-1 truncate">{component.name}</span>
                <button type="button" onClick={() => moveComponent(group.id, component.id, group.id, -1)} aria-label={`Move ${component.name} up`}>↑</button>
                <button type="button" onClick={() => moveComponent(group.id, component.id, group.id, 1)} aria-label={`Move ${component.name} down`}>↓</button>
                <FluentSelect
                  aria-label={`Move ${component.name} to group`}
                  value={group.id}
                  onChange={(event) => moveComponent(group.id, component.id, event.target.value || null)}
                  className="max-w-20 bg-transparent text-[10px]"
                >
                  <option value="">None</option>
                  {groups.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
                </FluentSelect>
                <span className="sr-only">{componentIndex + 1}</span>
              </div>
            ))}
          </div>
        ))}
        {ungrouped.length > 0 && (
          <div className="border border-[var(--line)] p-2 text-xs">
            <strong>Ungrouped · {ungrouped.length}</strong>
            {ungrouped.map((component) => (
              <div key={component.id} className="mt-1 flex items-center gap-1 bg-[var(--bg)] px-1.5 py-1">
                <span className="min-w-0 flex-1 truncate">{component.name}</span>
                <button type="button" onClick={() => moveComponent(null, component.id, null, -1)}>↑</button>
                <button type="button" onClick={() => moveComponent(null, component.id, null, 1)}>↓</button>
                <FluentSelect aria-label={`Move ${component.name} to group`} value="" onChange={(event) => moveComponent(null, component.id, event.target.value || null)} className="max-w-20 bg-transparent text-[10px]">
                  <option value="">None</option>
                  {groups.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
                </FluentSelect>
              </div>
            ))}
          </div>
        )}
      </div>
      {status && <p role="status" className="mt-2 text-xs text-[var(--fg-dim)]">{status}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" disabled={saving} onClick={save} className="border border-[var(--cyan)] px-3 py-1.5 text-xs font-semibold text-[var(--cyan)]">{saving ? "Saving…" : "Save groups and components"}</button>
        <Link href={`/organization/pages/${pageId}`} className="text-xs font-semibold text-[var(--cyan)] hover:underline">Edit group and component details</Link>
      </div>
    </section>
  );
}

function VersionPanel({
  current,
  versions,
  onRestore,
}: {
  current: number;
  versions: Array<{ version: number; templateKey: string; savedAt: string; design: StatusPageDesign }>;
  onRestore: (version: { version: number; design: StatusPageDesign }) => void;
}) {
  return (
    <section>
      <p className="mb-2 text-xs text-[var(--fg-dim)]">Live version {current}. Restoring loads a local preview; it becomes live only when saved.</p>
      <div
        aria-label="Saved design versions"
        className="max-h-64 space-y-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]"
        tabIndex={0}
      >
        {versions.map((version) => (
          <div key={version.version} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border border-[var(--line)] bg-[var(--surface)] p-2 text-xs">
            <span className="min-w-0">v{version.version} · {PAGE_TEMPLATE_LABELS[version.templateKey as keyof typeof PAGE_TEMPLATE_LABELS] ?? version.templateKey}<br /><span className="text-[var(--fg-dim)]">{new Date(version.savedAt).toLocaleString()}</span></span>
            <Button
              appearance="transparent"
              shape="square"
              size="small"
              type="button"
              onClick={() => onRestore({ version: version.version, design: version.design })}
              className="sticky right-0 shrink-0 bg-[var(--surface)] px-2 font-semibold underline"
            >
              Restore
            </Button>
          </div>
        ))}
        {!versions.length && <p className="text-xs text-[var(--fg-dim)]">Save a design change to start version history.</p>}
      </div>
    </section>
  );
}

function PanelTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h2 className={`mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-dim)] ${className}`}>{children}</h2>;
}

function SectionSaveButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      data-button-guard="off"
      onClick={onClick}
      className="mt-4 w-full border border-[var(--cyan)] px-3 py-2 text-xs font-semibold text-[var(--cyan)] hover:bg-[var(--cyan-soft)]"
    >
      {children}
    </button>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <div className="block text-xs text-[var(--fg-soft)]">
      {label}
      <FluentSelect aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs text-[var(--fg)]">
        {options.map((option) => <option key={option} value={option}>{option.toLowerCase().replaceAll("_", " ")}</option>)}
      </FluentSelect>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function Text({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-xs">{label}<input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5" /></label>;
}

"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
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
  PAGE_GRID_COLUMNS,
  PAGE_THEME_PRESET_KEYS,
  PAGE_THEME_PRESET_LABELS,
  UPTIME_BAR_SIZES,
  UPTIME_BAR_STYLES,
  UPTIME_ICON_STYLES,
  allSurfaceBlocks,
  applyPageTemplateLayout,
  designWithThemePreset,
  pageGridPlacements,
  resetPageGridBreakpoint,
  sameStatusPageDesign,
  statusPageDesignSchema,
  templateDesign,
  type PageDesignBlock,
  type PageDesignBreakpoint,
  type PageGridPlacement,
  type PageDesignZone,
  type PageSurfaceKey,
  type PageTemplateKey,
  type StatusPageDesign,
  updatePageGridPlacement,
} from "@/lib/page-design";
import {
  createAnnouncement,
  deleteAnnouncement,
  duplicateStatusPage,
  resetLegacyCss,
  publishDesignDraft,
  saveDesignDraft,
  updateAnnouncement,
} from "@/app/admin/(protected)/pages/[pageId]/design/actions";
import { COMPONENT_STATUS_COLOR } from "@/lib/status";
import { coverImageStyle, type CoverImageFit } from "@/lib/cover-image";
import { AssetUploader } from "@/components/admin/AssetUploader";

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
  termsUrl: string | null;
  privacyUrl: string | null;
  publicPath: string;
  isHub: boolean;
  publicAvailable: boolean;
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
  initialPublishedDesign,
  initialRevision,
  publishedVersion,
  versions,
  groups,
  ungrouped,
}: {
  page: EditorPage;
  initialDesign: StatusPageDesign;
  initialPublishedDesign: StatusPageDesign;
  initialRevision: number;
  publishedVersion: number;
  versions: Array<{ version: number; templateKey: string; savedAt: string; design: StatusPageDesign }>;
  groups: StructureGroup[];
  ungrouped: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [design, setDesign] = useState(initialDesign);
  const [undoStack, setUndoStack] = useState<StatusPageDesign[]>([]);
  const [redoStack, setRedoStack] = useState<StatusPageDesign[]>([]);
  const [savedDesign, setSavedDesign] = useState(() => cloneDesign(initialDesign));
  const [publishedDesign, setPublishedDesign] = useState(() => cloneDesign(initialPublishedDesign));
  const [revision, setRevision] = useState(initialRevision);
  const revisionRef = useRef(initialRevision);
  const [surface, setSurface] = useState<PageSurfaceKey>("status");
  const [selectedId, setSelectedId] = useState<string | null>(initialDesign.surfaces.status.full[0]?.id ?? null);
  const [viewport, setViewport] = useState<"DESKTOP" | "TABLET" | "MOBILE">("DESKTOP");
  const [saveState, setSaveState] = useState<"SAVED" | "DIRTY" | "SAVING" | "CONFLICT" | "ERROR">("SAVED");
  const [message, setMessage] = useState("");
  const [, startTransition] = useTransition();
  const structureGroups = groups;
  const structureUngrouped = ungrouped;
  const [branding] = useState(page);
  const visitorLinks = {
    supportUrl: design.presentation.supportUrl ?? "",
    termsUrl: design.presentation.termsUrl ?? "",
    privacyUrl: design.presentation.privacyUrl ?? "",
  };
  const [liveVersion, setLiveVersion] = useState(publishedVersion);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [pendingBlockRemoval, setPendingBlockRemoval] = useState<{
    blockId: string;
    changes: string[];
    label: string;
    surface: PageSurfaceKey;
  } | null>(null);
  const [templatePreviewKey, setTemplatePreviewKey] = useState<PageTemplateKey>(initialDesign.templateKey);
  const [templatePreviewActive, setTemplatePreviewActive] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>("composition");
  const [previewVisible, setPreviewVisible] = useState(true);
  const [addZone, setAddZone] = useState<PageDesignZone>("primary");

  const selected = (() => {
    for (const zone of ZONES) {
      const block = design.surfaces[surface][zone.key].find((candidate) => candidate.id === selectedId);
      if (block) return { block, zone: zone.key };
    }
    return null;
  })();
  const previewDesign = (() => {
    const preview = templatePreviewActive
      ? applyPageTemplateLayout(design, templatePreviewKey)
      : cloneDesign(design);
    return preview;
  })();

  function commit(next: StatusPageDesign) {
    if (sameStatusPageDesign(design, next)) return;
    setUndoStack((current) => [...current.slice(-49), cloneDesign(design)]);
    setRedoStack([]);
    setDesign(next);
    setSaveState("DIRTY");
  }

  function undo() {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setUndoStack((current) => current.slice(0, -1));
    setRedoStack((current) => [...current, cloneDesign(design)]);
    setDesign(previous);
    setSaveState("DIRTY");
  }

  function redo() {
    const next = redoStack.at(-1);
    if (!next) return;
    setRedoStack((current) => current.slice(0, -1));
    setUndoStack((current) => [...current, cloneDesign(design)]);
    setDesign(next);
    setSaveState("DIRTY");
  }

  async function saveChanges(successMessage = "Changes saved") {
    if (saveState === "SAVING") return false;
    setSaveState("SAVING");
    setMessage("");
    const designToSave = cloneDesign(previewDesign);
    const result = await saveDesignDraft(page.id, designToSave, revisionRef.current);
    if (result.ok) {
      setDesign(designToSave);
      setSavedDesign(cloneDesign(designToSave));
      setTemplatePreviewKey(designToSave.templateKey);
      setTemplatePreviewActive(false);
      if (!findDesignBlock(designToSave, surface, selectedId ?? "")) {
        const firstBlock = allSurfaceBlocks(designToSave, surface)[0];
        setSelectedId(firstBlock?.id ?? null);
      }
      revisionRef.current = result.revision;
      setRevision(result.revision);
      setLiveVersion(result.liveVersion ?? liveVersion);
      setSaveState("SAVED");
      setMessage(result.unchanged ? "Draft is up to date" : successMessage);
      router.refresh();
      return true;
    }
    setMessage(result.error);
    setSaveState(result.conflict ? "CONFLICT" : "ERROR");
    return false;
  }

  function updateVisitorLink(key: keyof typeof visitorLinks, value: string) {
    updatePresentation({ [key]: value || null });
  }

  async function saveEverything() {
    setMessage("");
    await saveChanges("Draft saved");
  }

  async function publishChanges() {
    setMessage("");
    const saved = await saveChanges("Draft saved");
    if (!saved) return;
    setSaveState("SAVING");
    const result = await publishDesignDraft(page.id, revisionRef.current);
    if (!result.ok) {
      setMessage(result.error);
      setSaveState(result.conflict ? "CONFLICT" : "ERROR");
      return;
    }
    setPublishedDesign(cloneDesign(previewDesign));
    setLiveVersion(result.liveVersion ?? liveVersion);
    setSaveState("SAVED");
    setMessage(result.unchanged ? "No unpublished changes" : `Published version ${result.liveVersion}`);
    router.refresh();
  }

  useEffect(() => {
    if (saveState !== "DIRTY") return;
    const timer = window.setTimeout(() => { void saveChanges("Draft autosaved"); }, 800);
    return () => window.clearTimeout(timer);
    // saveChanges deliberately reads the latest render snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design, templatePreviewKey, templatePreviewActive, saveState]);

  function addBlock(type: PageDesignBlock["type"]) {
    const next = cloneDesign(design);
    const alreadyAdded = allSurfaceBlocks(next, surface).some((block) => block.type === type);
    if (alreadyAdded && !REPEATABLE_BLOCK_TYPES.has(type)) {
      setMessage(`${blockLabel(newBlock(type))} is already added to this surface`);
      return;
    }
    const block = newBlock(type);
    next.surfaces[surface][addZone].push(block);
    next.surfaces[surface].grid.desktop.push({
      blockId: block.id,
      order: next.surfaces[surface].grid.desktop.length,
      column: 1,
      span: PAGE_GRID_COLUMNS.desktop,
    });
    for (const breakpoint of ["tablet", "mobile"] as const) {
      const placements = next.surfaces[surface].grid[breakpoint];
      if (placements) placements.push({ blockId: block.id, order: placements.length, column: 1, span: PAGE_GRID_COLUMNS[breakpoint] });
    }
    commit(next);
    setSelectedId(block.id);
    setExpandedSection("composition");
    setMessage(`${blockLabel(block)} added to the ${ZONES.find((zone) => zone.key === addZone)?.label} zone`);
  }

  function selectBlock(blockId: string) {
    const current = findDesignBlock(design, surface, blockId);
    if (!current) return;
    setSelectedId(blockId);
    setAddZone(current.zone);
    setExpandedSection("composition");
  }


  function updateSelected(updater: (block: PageDesignBlock) => PageDesignBlock) {
    if (!selected) return;
    const next = cloneDesign(design);
    const blocks = next.surfaces[surface][selected.zone];
    const index = blocks.findIndex((block) => block.id === selected.block.id);
    blocks[index] = updater(blocks[index]);
    commit(next);
  }


  function requestBlockRemoval(blockId: string) {
    const current = findDesignBlock(design, surface, blockId);
    if (!current) return;
    setAddZone(current.zone);
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
    for (const breakpoint of ["desktop", "tablet", "mobile"] as const) {
      const placements = next.surfaces[pendingBlockRemoval.surface].grid[breakpoint];
      if (placements) next.surfaces[pendingBlockRemoval.surface].grid[breakpoint] = placements
        .filter((placement) => placement.blockId !== pendingBlockRemoval.blockId)
        .map((placement, order) => ({ ...placement, order }));
    }
    commit(next);
    if (selectedId === pendingBlockRemoval.blockId) setSelectedId(null);
    setMessage(`${pendingBlockRemoval.label} removed from the draft. Publish when ready.`);
    setPendingBlockRemoval(null);
  }

  function resetToDefaultDraft() {
    const next = templateDesign("CENTERED_SUMMARY");
    setResetDialogOpen(false);
    commit(next);
    setSurface("status");
    setSelectedId(next.surfaces.status.full[0]?.id ?? null);
    setTemplatePreviewKey("CENTERED_SUMMARY");
    setTemplatePreviewActive(false);
    setMessage("Default design loaded into the draft. Review it, then Publish when ready.");
  }

  function updateTheme<Key extends keyof StatusPageDesign["theme"]>(key: Key, value: StatusPageDesign["theme"][Key]) {
    const next = cloneDesign(design);
    next.theme[key] = value;
    commit(next);
  }

  function applyThemePreset(key: string) {
    commit(designWithThemePreset(design, key as StatusPageDesign["theme"]["preset"]));
  }

  function updatePalette(key: keyof StatusPageDesign["theme"]["palette"], value: string) {
    const next = cloneDesign(design);
    next.theme.palette[key] = value;
    commit(next);
  }

  function updatePresentation(patch: Partial<StatusPageDesign["presentation"]>) {
    const next = cloneDesign(design);
    next.presentation = { ...next.presentation, ...patch };
    commit(statusPageDesignSchema.parse(next));
  }

  const activeBreakpoint = viewport.toLowerCase() as PageDesignBreakpoint;

  function updateGridPlacement(blockId: string, patch: Partial<Pick<PageGridPlacement, "column" | "span" | "order">>) {
    commit(updatePageGridPlacement(design, surface, activeBreakpoint, blockId, patch));
  }

  function resetActiveBreakpoint() {
    if (activeBreakpoint === "desktop") return;
    commit(resetPageGridBreakpoint(design, surface, activeBreakpoint));
    setMessage(`${activeBreakpoint[0].toUpperCase()}${activeBreakpoint.slice(1)} now inherits the desktop layout`);
  }

  function gridDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const placements = pageGridPlacements(design, surface, activeBreakpoint);
    const oldIndex = placements.findIndex((placement) => placement.blockId === String(event.active.id));
    const newIndex = placements.findIndex((placement) => placement.blockId === String(event.over?.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const ordered = arrayMove(placements, oldIndex, newIndex).map((placement, order) => ({ ...placement, order }));
    const next = cloneDesign(design);
    next.surfaces[surface].grid[activeBreakpoint] = ordered;
    commit(statusPageDesignSchema.parse(next));
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
      <header className="sticky top-0 z-50 flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-3 shadow-sm">
        <Link href={`/organization/pages/${page.id}`} className="inline-flex min-h-9 items-center border border-[var(--line)] px-3 text-sm font-semibold hover:border-[var(--cyan)]">
          ← Back
        </Link>
        <div>
          <p className="text-xs uppercase tracking-wider text-[var(--fg-dim)]">Visual designer</p>
          <h1 className="font-mono text-lg font-semibold">{page.name}</h1>
        </div>
        <span className={`ml-auto text-xs ${saveState === "ERROR" || saveState === "CONFLICT" ? "text-[var(--red)]" : "text-[var(--fg-dim)]"}`}>
          {saveState === "SAVING" ? "Saving…" : saveState === "DIRTY" ? "Unsaved changes" : saveState === "CONFLICT" ? "Editing conflict" : saveState === "ERROR" ? "Save failed" : `Draft r${revision}`}
        </span>
        <div
          role="toolbar"
          aria-label="Designer actions"
          className="order-last flex w-full items-center gap-2 overflow-x-auto pb-0.5 xl:order-none xl:w-auto xl:pb-0"
        >
          <button type="button" onClick={undo} disabled={!undoStack.length} aria-label="Undo design change" className="shrink-0 border border-[var(--line)] px-3 py-2 text-sm disabled:opacity-40">↶</button>
          <button type="button" onClick={redo} disabled={!redoStack.length} aria-label="Redo design change" className="shrink-0 border border-[var(--line)] px-3 py-2 text-sm disabled:opacity-40">↷</button>
          <button type="button" data-button-guard="off" onClick={() => void publishChanges()} disabled={saveState === "SAVING" || saveState === "CONFLICT" || sameStatusPageDesign(previewDesign, publishedDesign)} className="shrink-0 bg-[var(--cyan)] px-4 py-2 text-sm font-semibold text-[var(--on-cyan)] disabled:opacity-50">
            {saveState === "SAVING" ? "Saving…" : "Publish"}
          </button>
          <button
            type="button"
            data-button-guard="off"
            onClick={() => setPreviewVisible((visible) => !visible)}
            aria-pressed={!previewVisible}
            className="shrink-0 whitespace-nowrap border border-[var(--line)] px-3 py-2 text-sm hover:border-[var(--cyan)]"
          >
            {previewVisible ? "Hide preview" : "Show preview"}
          </button>
          <button type="button" onClick={() => startTransition(async () => {
            const result = await duplicateStatusPage(page.id);
            if (result.ok) router.push(`/organization/pages/${result.pageId}/design`);
          })} className="shrink-0 border border-[var(--line)] px-3 py-2 text-sm">Duplicate</button>
          <Button appearance="secondary" shape="square" type="button" data-button-busy-mode="interaction" className="shrink-0 whitespace-nowrap" onClick={() => setResetDialogOpen(true)}>
            Reset to default
          </Button>
          {page.publicAvailable ? (
            <Link
              href={page.publicPath}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-9 shrink-0 items-center whitespace-nowrap border border-[var(--line)] px-3 text-sm font-semibold hover:border-[var(--cyan)]"
            >
              View live page ↗
            </Link>
          ) : (
            <Link href={`/organization/pages/${page.id}#publish`} className="inline-flex min-h-9 shrink-0 items-center whitespace-nowrap border border-[var(--amber)]/40 px-3 text-sm font-semibold text-[var(--amber)]">
              Finish setup to view live page
            </Link>
          )}
        </div>
      </header>

      <Dialog open={resetDialogOpen} onOpenChange={(_event, data) => setResetDialogOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Reset this design to default?</DialogTitle>
            <DialogContent className="space-y-3">
              <p>This will replace the current draft&apos;s visual layout, blocks, theme, header and footer configuration, SEO settings, and uptime presentation.</p>
              <p className="font-semibold">It will not delete the page, services, groups, incidents, subscribers, status history, or uploaded assets.</p>
              <p>The reset is autosaved as a draft. The public page stays unchanged until you choose Publish.</p>
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
              <p>The removal is autosaved in this draft and stays private until Publish.</p>
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

      <div className={`grid min-h-0 flex-1 ${previewVisible ? "grid-rows-[minmax(13rem,34vh)_minmax(0,1fr)] xl:grid-cols-[minmax(42rem,1.7fr)_minmax(24rem,1fr)] xl:grid-rows-1" : "grid-cols-1 grid-rows-1"}`}>
        <main className={`${previewVisible ? "row-start-2 xl:col-start-1 xl:row-start-1" : "row-start-1"} min-h-0 min-w-0 overflow-y-auto overscroll-contain bg-[var(--bg)]`}>
          <div className="mx-auto w-full max-w-[96rem] space-y-5 p-4 pb-10 lg:p-6 lg:pb-12">
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
                <h2 className="font-mono text-sm font-semibold">Starting points</h2>
                <p className="mt-1 text-xs text-[var(--fg-dim)]">Apply a responsive arrangement without replacing blocks, content, branding, or appearance.</p>
              </div>
            <div className="max-w-xl">
              <div>
                <PanelTitle>Page template</PanelTitle>
                <Select
                  label="Layout"
                  value={templatePreviewKey}
                  onChange={(value) => {
                    const key = value as PageTemplateKey;
                    setTemplatePreviewKey(key);
                    setTemplatePreviewActive(false);
                    commit(applyPageTemplateLayout(design, key));
                    setMessage("Starting point applied to the draft. Publish when ready.");
                  }}
                  options={[...PAGE_TEMPLATE_KEYS]}
                />
                <p className="mt-2 text-xs text-[var(--fg-dim)]">{PAGE_TEMPLATE_LABELS[templatePreviewKey]} changes page composition while preserving SEO and the selected theme.</p>
              </div>
            </div>
            </section>

            <EditorSection id="composition" title="Responsive canvas" description="Add, arrange, and resize blocks on the selected desktop, tablet, or mobile grid." open={expandedSection === "composition"} onToggle={setExpandedSection}>
              <div>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-dim)]">Add block</h2>
                    <p className="mt-1 text-xs text-[var(--fg-dim)]">New blocks start full-width and can be resized on the grid.</p>
                  </div>
                  {activeBreakpoint !== "desktop" && design.surfaces[surface].grid[activeBreakpoint] && (
                    <button type="button" onClick={resetActiveBreakpoint} className="border border-[var(--line)] px-3 py-2 text-xs hover:border-[var(--cyan)]">Reset to desktop inheritance</button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {BLOCK_LIBRARY.filter((item) => item.surfaces.includes(surface)).map((item) => (
                    (() => {
                      const matchingBlocks = allSurfaceBlocks(design, surface).filter((block) => block.type === item.type);
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
              <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
                <ResponsiveGridCanvas
                  design={design}
                  surface={surface}
                  breakpoint={activeBreakpoint}
                  selectedId={selectedId}
                  onDragEnd={gridDragEnd}
                  onSelect={selectBlock}
                  onRemove={requestBlockRemoval}
                />
                <aside className="border border-[var(--line)] bg-[var(--surface-raised)] p-4" aria-label="Selected block settings">
                  {selected ? (
                    <>
                      <div className="mb-4 border-b border-[var(--line)] pb-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--fg-dim)]">Selected block</p>
                        <div className="mt-1 flex items-center justify-between gap-3">
                          <h3 className="font-mono text-sm font-semibold">{blockLabel(selected.block)}</h3>
                          <span className="text-[10px] uppercase text-[var(--fg-dim)]">{activeBreakpoint}</span>
                        </div>
                      </div>
                      <GridPlacementControls
                        placement={pageGridPlacements(design, surface, activeBreakpoint).find((placement) => placement.blockId === selected.block.id) ?? null}
                        columns={PAGE_GRID_COLUMNS[activeBreakpoint]}
                        onChange={(patch) => updateGridPlacement(selected.block.id, patch)}
                      />
                      <BlockInspector
                        block={selected.block}
                        onUpdate={updateSelected}
                        onRemove={() => requestBlockRemoval(selected.block.id)}
                        onSave={() => void saveEverything()}
                      />
                    </>
                  ) : (
                    <div className="py-8 text-center text-xs text-[var(--fg-dim)]">
                      Select a block to edit its width, position, visibility, and presentation settings.
                    </div>
                  )}
                </aside>
              </div>
            </EditorSection>

            <div className="grid items-start gap-5 xl:grid-cols-2">
              <EditorSection id="assets" title="Brand assets" description="Stage the logo, favicon, and cover image that will be used after Publish." open={expandedSection === "assets"} onToggle={setExpandedSection}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <AssetUploader
                    pageId={page.id}
                    kind="LOGO"
                    currentUrl={design.presentation.logoUrl}
                    label="Logo"
                    help="Preserves the original aspect ratio."
                    staged
                    onStagedChange={({ url }) => updatePresentation({ logoUrl: url })}
                  />
                  <AssetUploader
                    pageId={page.id}
                    kind="FAVICON"
                    currentUrl={design.presentation.faviconUrl}
                    label="Favicon"
                    help="Shown in supported browsers and feeds after Publish."
                    staged
                    onStagedChange={({ url }) => updatePresentation({ faviconUrl: url })}
                  />
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
                    help="Used by layouts with a wide visual banner."
                    staged
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
              </EditorSection>
              <EditorSection id="theme" title="Advanced appearance" description="Typography, spacing, shape, and detailed surface colors." open={expandedSection === "theme"} onToggle={setExpandedSection}>
                <ThemePanel design={design} updateTheme={updateTheme} updatePalette={updatePalette} onPreset={applyThemePreset} onSave={() => void saveEverything()} />
              </EditorSection>
              <EditorSection id="chrome" title="Header, footer, and visitor links" description="Configure public navigation, footer content, support, and legal links in one place." open={expandedSection === "chrome"} onToggle={setExpandedSection}>
                <ChromePanel design={design} visitorLinks={visitorLinks} onVisitorLinkChange={updateVisitorLink} onChange={commit} onSave={() => void saveEverything()} />
              </EditorSection>
            </div>

            <EditorSection id="versions" title="Saved versions" description="Review earlier saved designs and load one into the local draft." open={expandedSection === "versions"} onToggle={setExpandedSection}>
              <VersionPanel current={liveVersion} versions={versions} onRestore={restoreVersion} />
            </EditorSection>
          </div>
        </main>

        {previewVisible && <aside className="row-start-1 flex min-h-0 flex-col overflow-hidden border-b border-[var(--line)] bg-[var(--surface)] xl:col-start-2 xl:row-start-1 xl:border-b-0 xl:border-l">
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
              <DesignPreview
                page={{
                  ...branding,
                  logoUrl: previewDesign.presentation.logoUrl,
                  faviconUrl: previewDesign.presentation.faviconUrl,
                  coverImageUrl: previewDesign.presentation.coverImageUrl,
                  coverImageFit: previewDesign.presentation.coverImageFit,
                  coverImagePositionX: previewDesign.presentation.coverImagePositionX,
                  coverImagePositionY: previewDesign.presentation.coverImagePositionY,
                  coverImageCropX: previewDesign.presentation.coverImageCropX,
                  coverImageCropY: previewDesign.presentation.coverImageCropY,
                  coverImageCropWidth: previewDesign.presentation.coverImageCropWidth,
                  coverImageCropHeight: previewDesign.presentation.coverImageCropHeight,
                  supportUrl: previewDesign.presentation.supportUrl,
                  termsUrl: previewDesign.presentation.termsUrl,
                  privacyUrl: previewDesign.presentation.privacyUrl,
                }}
                design={previewDesign}
                surface={surface}
                viewport={viewport}
                groups={structureGroups}
                ungrouped={structureUngrouped}
                onSelectBlock={selectBlock}
                onSelectChrome={() => setExpandedSection("chrome")}
              />
            </div>
          </div>
          <div className="shrink-0 border-t border-[var(--line)] px-4 py-3 text-[10px] text-[var(--fg-dim)]">
            Changes autosave as a draft. Publish when you are ready to update the public page.
          </div>
        </aside>}
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

function ChromePanel({
  design,
  visitorLinks,
  onVisitorLinkChange,
  onChange,
  onSave,
}: {
  design: StatusPageDesign;
  visitorLinks: { supportUrl: string; termsUrl: string; privacyUrl: string };
  onVisitorLinkChange: (key: "supportUrl" | "termsUrl" | "privacyUrl", value: string) => void;
  onChange: (design: StatusPageDesign) => void;
  onSave: () => void;
}) {
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
      <fieldset className="mt-4 border border-[var(--line)] p-3">
        <legend className="px-1 font-mono text-xs font-semibold">Built-in visitor links</legend>
        <p className="mb-3 text-xs leading-5 text-[var(--fg-dim)]">These links appear in the public footer when the Legal footer item is enabled.</p>
        <div className="grid gap-3">
          <VisitorLinkField label="Support URL" value={visitorLinks.supportUrl} allowMailto onChange={(value) => onVisitorLinkChange("supportUrl", value)} />
          <VisitorLinkField label="Terms of Service URL" value={visitorLinks.termsUrl} onChange={(value) => onVisitorLinkChange("termsUrl", value)} />
          <VisitorLinkField label="Privacy Policy URL" value={visitorLinks.privacyUrl} onChange={(value) => onVisitorLinkChange("privacyUrl", value)} />
        </div>
      </fieldset>
      <label className="mt-3 block text-xs">
        Additional footer links <span className="text-[var(--fg-dim)]">(Label | https://…)</span>
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

function VisitorLinkField({ label, value, allowMailto = false, onChange }: { label: string; value: string; allowMailto?: boolean; onChange: (value: string) => void }) {
  return (
    <label className="block text-xs text-[var(--fg-soft)]">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="url"
        pattern={allowMailto ? "(?:https?://.+|mailto:.+)" : "https?://.+"}
        placeholder={allowMailto ? "https://support.example.com or mailto:help@example.com" : "https://example.com"}
        className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none"
      />
    </label>
  );
}

function parseLinks(value: string) {
  return value
    .split("\n")
    .map((line) => line.split("|").map((part) => part.trim()))
    .filter((parts) => parts.length === 2 && parts[0] && /^https?:\/\//.test(parts[1]))
    .map(([label, url]) => ({ label: label.slice(0, 80), url }));
}

function ResponsiveGridCanvas({
  design,
  surface,
  breakpoint,
  selectedId,
  onDragEnd,
  onSelect,
  onRemove,
}: {
  design: StatusPageDesign;
  surface: PageSurfaceKey;
  breakpoint: PageDesignBreakpoint;
  selectedId: string | null;
  onDragEnd: (event: DragEndEvent) => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const blocks = new Map(allSurfaceBlocks(design, surface).map((block) => [block.id, block]));
  const placements = pageGridPlacements(design, surface, breakpoint).sort((left, right) => left.order - right.order);
  const inherited = breakpoint !== "desktop" && design.surfaces[surface].grid[breakpoint] === null;
  return (
    <section className="border border-[var(--line)] bg-[var(--bg)] p-3" aria-label={`${breakpoint} responsive layout`}>
      <div className="mb-3 flex items-center justify-between gap-3 text-xs text-[var(--fg-dim)]">
        <span>{PAGE_GRID_COLUMNS[breakpoint]} column {breakpoint} grid</span>
        {inherited && <span className="bg-[var(--cyan-soft)] px-2 py-1 font-semibold text-[var(--cyan)]">Inherited from desktop</span>}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={placements.map((placement) => placement.blockId)} strategy={verticalListSortingStrategy}>
          <div
            className="grid min-h-52 auto-rows-min gap-2 border border-dashed border-[var(--line-bright)] p-2"
            style={{ gridTemplateColumns: `repeat(${PAGE_GRID_COLUMNS[breakpoint]}, minmax(0, 1fr))` }}
          >
            {placements.map((placement) => {
              const block = blocks.get(placement.blockId);
              if (!block) return null;
              return (
                <SortableGridBlock
                  key={block.id}
                  block={block}
                  placement={placement}
                  selected={selectedId === block.id}
                  onSelect={() => onSelect(block.id)}
                  onRemove={() => onRemove(block.id)}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
}

function SortableGridBlock({
  block,
  placement,
  selected,
  onSelect,
  onRemove,
}: {
  block: PageDesignBlock;
  placement: PageGridPlacement;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  return (
    <div
      ref={setNodeRef}
      style={{
        gridColumn: `${placement.column} / span ${placement.span}`,
        order: placement.order,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`flex min-w-0 items-center gap-2 border p-2 text-xs ${selected ? "border-[var(--cyan)] bg-[var(--cyan-soft)]" : "border-[var(--line)] bg-[var(--surface)]"} ${isDragging ? "z-10 opacity-60 shadow-lg" : ""}`}
    >
      <button ref={setActivatorNodeRef} type="button" {...attributes} {...listeners} aria-label={`Reorder ${blockLabel(block)}`} className="cursor-grab text-[var(--fg-dim)] active:cursor-grabbing">⠿</button>
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 truncate text-left font-semibold">{blockLabel(block)}</button>
      {block.hidden && <span className="text-[10px] text-[var(--fg-dim)]">Hidden</span>}
      <button type="button" onClick={onRemove} aria-label={`Remove ${blockLabel(block)}`} className="text-[var(--red)]">−</button>
    </div>
  );
}

function GridPlacementControls({
  placement,
  columns,
  onChange,
}: {
  placement: PageGridPlacement | null;
  columns: number;
  onChange: (patch: Partial<Pick<PageGridPlacement, "column" | "span">>) => void;
}) {
  if (!placement) return null;
  return (
    <fieldset className="mb-4 border border-[var(--line)] bg-[var(--bg)] p-3">
      <legend className="px-1 font-mono text-xs font-semibold">Grid placement</legend>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs">Column
          <input type="number" min={1} max={columns} value={placement.column} onChange={(event) => onChange({ column: Number(event.target.value) })} className="mt-1 w-full border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5" />
        </label>
        <label className="text-xs">Width
          <input type="number" min={1} max={columns - placement.column + 1} value={placement.span} onChange={(event) => onChange({ span: Number(event.target.value) })} className="mt-1 w-full border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5" />
        </label>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1">
        <button type="button" onClick={() => onChange({ column: placement.column - 1 })} className="border border-[var(--line)] py-1" aria-label="Move block left">←</button>
        <button type="button" onClick={() => onChange({ column: placement.column + 1 })} className="border border-[var(--line)] py-1" aria-label="Move block right">→</button>
        <button type="button" onClick={() => onChange({ span: placement.span - 1 })} className="border border-[var(--line)] py-1" aria-label="Make block narrower">−</button>
        <button type="button" onClick={() => onChange({ span: placement.span + 1 })} className="border border-[var(--line)] py-1" aria-label="Make block wider">＋</button>
      </div>
    </fieldset>
  );
}

function ThemePanel({
  design,
  updateTheme,
  updatePalette,
  onPreset,
  onSave,
}: {
  design: StatusPageDesign;
  updateTheme: <Key extends keyof StatusPageDesign["theme"]>(key: Key, value: StatusPageDesign["theme"][Key]) => void;
  updatePalette: (key: keyof StatusPageDesign["theme"]["palette"], value: string) => void;
  onPreset: (key: string) => void;
  onSave: () => void;
}) {
  return (
    <section>
      <Select label="Style preset" value={design.theme.preset} onChange={onPreset} options={[...PAGE_THEME_PRESET_KEYS]} labels={PAGE_THEME_PRESET_LABELS} />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-xs">Brand color
          <input type="color" value={design.theme.palette.brand} onChange={(event) => updatePalette("brand", event.target.value)} className="mt-1 h-9 w-full border border-[var(--line)] bg-transparent" />
        </label>
        <Select label="Visitor appearance" value={design.theme.mode} onChange={(value) => updateTheme("mode", value as StatusPageDesign["theme"]["mode"])} options={["SYSTEM", "LIGHT", "DARK"]} />
      </div>
      <Check label="Let visitors switch light/dark" checked={design.theme.allowVisitorMode} onChange={(value) => updateTheme("allowVisitorMode", value)} />
      <div className="my-4 border-t border-[var(--line)]" />
      <div className="grid grid-cols-2 gap-2">
        <Select label="Type" value={design.theme.typography} onChange={(value) => updateTheme("typography", value as StatusPageDesign["theme"]["typography"])} options={["SYSTEM", "HUMANIST", "GEOMETRIC", "MONO"]} />
        <Select label="Density" value={design.theme.density} onChange={(value) => updateTheme("density", value as StatusPageDesign["theme"]["density"])} options={["COMPACT", "COMFORTABLE", "SPACIOUS"]} />
        <Select label="Width" value={design.theme.contentWidth} onChange={(value) => updateTheme("contentWidth", value as StatusPageDesign["theme"]["contentWidth"])} options={["NARROW", "STANDARD", "WIDE"]} />
        <Select label="Radius" value={design.theme.radius} onChange={(value) => updateTheme("radius", value as StatusPageDesign["theme"]["radius"])} options={["NONE", "SMALL", "MEDIUM", "LARGE"]} />
        <Select label="Shadow" value={design.theme.shadow} onChange={(value) => updateTheme("shadow", value as StatusPageDesign["theme"]["shadow"])} options={["NONE", "SUBTLE", "ELEVATED"]} />
      </div>
      <p className="mt-3 text-xs text-[var(--fg-dim)]">These values override the selected style preset. Choose a new preset from Appearance to reset them.</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {(["background", "surface", "text"] as const).map((key) => (
          <label key={key} title={key} className="text-[10px] capitalize text-[var(--fg-dim)]">
            <input type="color" value={design.theme.palette[key]} onChange={(event) => updatePalette(key, event.target.value)} className="h-8 w-full border-0 bg-transparent" />
            {key.replace(/([A-Z])/g, " $1")}
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs text-[var(--fg-dim)]">
        Operational, degraded, outage, and maintenance colors use the standard SignalHub severity palette.
      </p>
      <SectionSaveButton onClick={onSave}>Save advanced appearance</SectionSaveButton>
    </section>
  );
}

function BlockInspector({
  block,
  onUpdate,
  onRemove,
  onSave,
}: {
  block: PageDesignBlock;
  onUpdate: (updater: (block: PageDesignBlock) => PageDesignBlock) => void;
  onRemove: () => void;
  onSave: () => void;
}) {
  function patchSettings(settings: Record<string, unknown>) {
    onUpdate((current) => ({ ...current, settings: { ...current.settings, ...settings } } as PageDesignBlock));
  }
  return (
    <section>
      <label className="flex items-center gap-2 text-xs">
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
          <fieldset className="space-y-2 border border-[var(--line)] bg-[var(--bg)] p-3">
            <legend className="px-1 font-mono text-xs font-semibold">Uptime indicators</legend>
            <p className="text-[10px] text-[var(--fg-dim)]">Use Blocks for thicker indicators; Responsive fits every day into the available width.</p>
            <Select label="Uptime window" value={String(block.settings.uptimeDays)} onChange={(value) => patchSettings({ uptimeDays: Number(value) })} options={["30", "60", "90"]} />
            <Select label="Uptime line style" value={block.settings.uptimeStyle} onChange={(value) => patchSettings({ uptimeStyle: value })} options={[...UPTIME_BAR_STYLES]} />
            <Select label="Uptime segment size" value={block.settings.uptimeSize} onChange={(value) => patchSettings({ uptimeSize: value })} options={[...UPTIME_BAR_SIZES]} />
            <Select label="Uptime segment icon" value={block.settings.uptimeIcon} onChange={(value) => patchSettings({ uptimeIcon: value })} options={[...UPTIME_ICON_STYLES]} />
            <Check label="Show uptime" checked={block.settings.showUptime} onChange={(value) => patchSettings({ showUptime: value })} />
          </fieldset>
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
  onSelectBlock,
  onSelectChrome,
}: {
  page: EditorPage;
  design: StatusPageDesign;
  surface: PageSurfaceKey;
  viewport: "DESKTOP" | "TABLET" | "MOBILE";
  groups: StructureGroup[];
  ungrouped: Array<{ id: string; name: string }>;
  onSelectBlock?: (id: string) => void;
  onSelectChrome?: () => void;
}) {
  const palette = design.theme.mode === "DARK"
    ? { ...design.theme.palette, ...design.theme.darkPalette }
    : design.theme.palette;
  const breakpoint = viewport.toLowerCase() as PageDesignBreakpoint;
  const placements = pageGridPlacements(design, surface, breakpoint);
  const placementByBlock = new Map(placements.map((placement) => [placement.blockId, placement]));
  const previewBlocks = allSurfaceBlocks(design, surface).filter((block) => !block.hidden && placementByBlock.has(block.id));
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
      <div role="button" tabIndex={0} aria-label="Edit page header" onClick={onSelectChrome} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelectChrome?.(); }} className={`flex cursor-pointer items-center gap-3 border-b px-5 py-4 outline-offset-[-2px] focus:outline focus:outline-2 focus:outline-[var(--cyan)] ${design.chrome.header.variant === "CENTERED" ? "justify-center" : ""}`} style={{ background: palette.surface, borderColor: `${palette.mutedText}30` }}>
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
      {(design.chrome.header.variant === "HERO" || design.templateKey === "BANNER_SPOTLIGHT" || page.coverImageUrl) && (
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
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${PAGE_GRID_COLUMNS[breakpoint]}, minmax(0, 1fr))` }}>
          {previewBlocks.map((block) => {
            const placement = placementByBlock.get(block.id)!;
            return (
              <div key={block.id} role="button" tabIndex={0} aria-label={`Edit ${blockLabel(block)}`} onClick={() => onSelectBlock?.(block.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelectBlock?.(block.id); }} style={{ gridColumn: `${placement.column} / span ${placement.span}`, order: placement.order }} className="min-w-0 cursor-pointer outline-offset-2 focus:outline focus:outline-2 focus:outline-[var(--cyan)]">
                <PreviewBlock block={block} palette={palette} viewport={viewport} groups={groups} ungrouped={ungrouped} />
              </div>
            );
          })}
        </div>
      </div>
      <div role="button" tabIndex={0} aria-label="Edit page footer" onClick={onSelectChrome} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelectChrome?.(); }} className="cursor-pointer border-t px-5 py-4 text-[10px] outline-offset-[-2px] focus:outline focus:outline-2 focus:outline-[var(--cyan)]" style={{ borderColor: `${palette.mutedText}30`, color: palette.mutedText }}>
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          {design.chrome.footer.items.filter((item) => !item.hidden).map((item) => {
            if (item.type === "CUSTOM_TEXT" && design.chrome.footer.customText) {
              return <span key={item.id}>{design.chrome.footer.customText}</span>;
            }
            if (item.type === "LINKS" && design.chrome.footer.links.length) {
              return <span key={item.id} className="flex flex-wrap gap-3">{design.chrome.footer.links.map((link) => <span key={link.url}>{link.label}</span>)}</span>;
            }
            if (item.type === "LEGAL" && (page.supportUrl || page.termsUrl || page.privacyUrl)) {
              return <span key={item.id} className="flex flex-wrap gap-3">{page.supportUrl && <span>Support</span>}{page.termsUrl && <span>Terms of Service</span>}{page.privacyUrl && <span>Privacy Policy</span>}</span>;
            }
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

export function PageAnnouncementManager({ pageId, announcements }: { pageId: string; announcements: EditorAnnouncement[] }) {
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function startCreate() {
    setTitle("");
    setBody("");
    setSeverity("INFO");
    setCtaLabel("");
    setCtaUrl("");
    setStartsAt(toLocalDateTimeInput(new Date()));
    setEndsAt("");
    setDismissible(false);
    setPriority("0");
    setEditingId(null);
    setError("");
    setExpanded(true);
  }

  function startEdit(announcement: EditorAnnouncement) {
    setTitle(announcement.title);
    setBody(announcement.body);
    setSeverity(announcement.severity);
    setCtaLabel(announcement.ctaLabel ?? "");
    setCtaUrl(announcement.ctaUrl ?? "");
    setStartsAt(toLocalDateTimeInput(new Date(announcement.startsAt)));
    setEndsAt(announcement.endsAt ? toLocalDateTimeInput(new Date(announcement.endsAt)) : "");
    setDismissible(announcement.dismissible);
    setPriority(String(announcement.priority));
    setEditingId(announcement.id);
    setError("");
    setExpanded(true);
  }

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
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" disabled={pending} onClick={() => startEdit(announcement)} className="border border-[var(--cyan)]/40 px-2 py-1 font-semibold text-[var(--cyan)]">Edit</button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(`Delete ${announcement.title}? This action cannot be undone.`)) return;
                  startTransition(async () => {
                    await deleteAnnouncement(pageId, announcement.id);
                    location.reload();
                  });
                }}
                className="border border-[var(--red)]/40 px-2 py-1 font-semibold text-[var(--red)]"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        data-button-busy-mode="interaction"
        onClick={() => {
          if (expanded) {
            setExpanded(false);
            setEditingId(null);
          } else {
            startCreate();
          }
        }}
        className="mt-3 text-xs underline"
      >
        {expanded ? (editingId ? "Close editor" : "Close composer") : "Create announcement"}
      </button>
      {expanded && (
        <div className="mt-3 space-y-3 border border-[var(--line)] bg-[var(--surface)] p-3">
          <h3 className="font-mono text-sm font-semibold">{editingId ? "Edit announcement" : "New announcement"}</h3>
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
                const startDate = new Date(startsAt);
                const endDate = endsAt ? new Date(endsAt) : null;
                if (!title.trim() || title.trim().length > 160) {
                  setError("Announcement title is required and must be 160 characters or fewer");
                  return;
                }
                if (body.length > 2_000) {
                  setError("Announcement message must be 2,000 characters or fewer");
                  return;
                }
                if (Boolean(ctaLabel.trim()) !== Boolean(ctaUrl.trim())) {
                  setError("CTA label and URL must be provided together");
                  return;
                }
                if (Number.isNaN(startDate.getTime()) || (endDate && Number.isNaN(endDate.getTime()))) {
                  setError("Enter a valid announcement schedule");
                  return;
                }
                const input = {
                    title,
                    body,
                    severity,
                    ctaLabel: ctaLabel || undefined,
                    ctaUrl: ctaUrl || undefined,
                    startsAt: startDate.toISOString(),
                    endsAt: endDate?.toISOString(),
                    dismissible,
                    priority: Number(priority) || 0,
                  };
                const result = editingId
                  ? await updateAnnouncement(pageId, editingId, input)
                  : await createAnnouncement(pageId, input);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                location.reload();
              })}
              className="border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-xs font-medium"
            >
              {pending ? (editingId ? "Saving…" : "Creating…") : (editingId ? "Save changes" : "Create")}
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
      <p className="mb-2 text-xs text-[var(--fg-dim)]">Live version {current}. Restoring loads the version into the autosaved draft; Publish makes it live.</p>
      <div aria-label="Saved design versions" className="max-h-64 space-y-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]" tabIndex={0}>
        {versions.map((version) => (
          <div key={version.version} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border border-[var(--line)] bg-[var(--surface)] p-2 text-xs">
            <span className="min-w-0">v{version.version} · {PAGE_TEMPLATE_LABELS[version.templateKey as keyof typeof PAGE_TEMPLATE_LABELS] ?? version.templateKey}<br /><span className="text-[var(--fg-dim)]">{new Date(version.savedAt).toLocaleString()}</span></span>
            <Button appearance="transparent" shape="square" size="small" type="button" onClick={() => onRestore({ version: version.version, design: version.design })} className="sticky right-0 shrink-0 bg-[var(--surface)] px-2 font-semibold underline">Restore</Button>
          </div>
        ))}
        {!versions.length && <p className="text-xs text-[var(--fg-dim)]">Publish a design change to start version history.</p>}
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

function Select({ label, value, onChange, options, labels }: { label: string; value: string; onChange: (value: string) => void; options: string[]; labels?: Record<string, string> }) {
  return (
    <div className="block text-xs text-[var(--fg-soft)]">
      {label}
      <FluentSelect aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs text-[var(--fg)]">
        {options.map((option) => <option key={option} value={option}>{labels?.[option] ?? option.toLowerCase().replaceAll("_", " ")}</option>)}
      </FluentSelect>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function Text({
  label,
  value,
  onChange,
  required = false,
  maxLength,
  inputMode,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  maxLength?: number;
  inputMode?: "url" | "text";
  placeholder?: string;
}) {
  return <label className="block text-xs">{label}<input value={value} required={required} maxLength={maxLength} inputMode={inputMode} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5" /></label>;
}

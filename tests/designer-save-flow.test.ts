import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("designer save workflow", () => {
  const actions = readFileSync("app/admin/(protected)/pages/[pageId]/design/actions.ts", "utf8");
  const editor = readFileSync("components/admin/DesignEditor.tsx", "utf8");

  it("saves the draft and live design in one fenced transaction", () => {
    expect(actions).toContain("export async function saveDesign(");
    expect(actions).toContain("withTransaction(");
    expect(actions).toContain("fenceActiveOrganizationMutation(");
    expect(actions).toContain("pageDesignVersions().insertOne(");
    expect(actions).toContain("publishedDesign: design");
    expect(actions).toContain('action: "SAVE_PAGE_DESIGN"');
  });

  it("does not expose a separate publish action and skips unchanged versions", () => {
    expect(actions).not.toContain("export async function publishDesignDraft");
    expect(editor).not.toContain("publishDesignDraft");
    expect(editor).not.toMatch(/>\s*Publish\s*</);
    expect(actions).toContain("const liveChanged = !sameStatusPageDesign(design, publishedDesign)");
    expect(actions).toContain("if (liveChanged) {");
  });

  it("keeps reset, import, and version restore local until save", () => {
    expect(editor).toContain("function resetToDefaultDraft()");
    expect(editor).toContain("commit(parsed)");
    expect(editor).toContain("function restoreVersion(");
    expect(editor).toContain("Save to make it live");
  });

  it("retains only the newest 30 saved design versions per page", () => {
    const page = readFileSync("app/admin/(protected)/pages/[pageId]/design/page.tsx", "utf8");
    const designModel = readFileSync("lib/page-design.ts", "utf8");

    expect(designModel).toContain("PAGE_DESIGN_VERSION_HISTORY_LIMIT = 30");
    expect(actions).toContain(".skip(PAGE_DESIGN_VERSION_HISTORY_LIMIT)");
    expect(actions).toContain("pageDesignVersions().deleteMany(");
    expect(actions).toContain("{ pageId: page._id, _id: { $in:");
    expect(page).toContain(".limit(PAGE_DESIGN_VERSION_HISTORY_LIMIT)");
  });

  it("uses a collapsed, single-open settings accordion while leaving the starting point visible", () => {
    expect(editor).toContain('const [expandedSection, setExpandedSection] = useState<string | null>(null)');
    expect(editor).toContain('onClick={() => onToggle(open ? null : id)}');
    expect(editor).toContain('{open && <div id={`editor-section-${id}`}');
    expect(editor).toContain('<h2 className="font-mono text-sm font-semibold">Starting point</h2>');
    expect(editor).not.toContain("defaultOpen");
  });

  it("keeps starting-point dropdowns preview-only without an apply action", () => {
    expect(editor).toContain("Layout and color system changes update the preview only");
    expect(editor).not.toContain("Apply preview to draft");
    expect(editor).not.toContain("function applyPresetPreview");
  });

  it("promotes the selected template and theme preview when saving", () => {
    expect(editor).toContain("const designToSave = cloneDesign(previewDesign)");
    expect(editor).toContain("saveDesign(page.id, designToSave, revisionRef.current)");
    expect(editor).toContain("setDesign(designToSave)");
    expect(editor).toContain("setTemplatePreviewActive(false)");
    expect(editor).toContain("setThemePreviewActive(false)");
    expect(editor).toContain("Template preview ready. Save all to update the public page.");
    expect(editor).toContain("Theme preview ready. Save all to update the public page.");
  });

  it("does not expose semantic status colors as theme customization", () => {
    expect(editor).toContain("standard SignalHub severity palette");
    expect(editor).not.toContain('["brand", "background", "surface", "text", "operational"');
  });

  it("lets every block be removed and warns about its unsaved field changes", () => {
    expect(editor).toContain("function requestBlockRemoval(blockId: string)");
    expect(editor).toContain("describeBlockChanges(savedDesign");
    expect(editor).toContain("This block has unsaved changes. Removing it will discard:");
    expect(editor).toContain("Remove {pendingBlockRemoval?.label}?");
    expect(editor).not.toContain("This block is required for an accessible, truthful status surface");
    expect(editor).not.toContain("disabled={required}");
  });

  it("keeps the page preview inside its own scrollable frame", () => {
    expect(editor).toContain('aria-label="Scrollable page preview"');
    expect(editor).toContain("overflow-y-auto overscroll-contain");
    expect(editor).toContain("h-dvh min-h-0 flex-col overflow-hidden");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("unified responsive designer workflow", () => {
  const actions = source("app/admin/(protected)/pages/[pageId]/design/actions.ts");
  const editor = source("components/admin/DesignEditor.tsx");
  const appearance = source("app/admin/(protected)/pages/[pageId]/appearance/page.tsx");
  const legacyRoute = source("app/admin/(protected)/pages/[pageId]/design/page.tsx");
  const assets = source("app/api/admin/pages/[pageId]/assets/route.ts");

  it("autosaves drafts without publishing them", () => {
    expect(actions).toContain("export async function saveDesignDraft(");
    expect(actions).toContain('insertInto("pageDesignDrafts")');
    expect(editor).toContain("saveDesignDraft(page.id, designToSave, revisionRef.current)");
    expect(editor).toContain("window.setTimeout(() => { void saveChanges");
    expect(editor).toContain("}, 800)");
  });

  it("publishes an exact draft in one fenced transaction", () => {
    expect(actions).toContain("export async function publishDesignDraft(");
    expect(actions).toContain("withTransaction(");
    expect(actions).toContain("fenceActiveOrganizationMutation(");
    expect(actions).toContain('insertInto("pageDesignVersions")');
    expect(actions).toContain("publishedDesign: design");
    expect(editor).toContain('"Publish"');
  });

  it("retains only the newest published versions", () => {
    expect(actions).toContain("delete from page_design_versions");
    expect(actions).toContain("limit ${PAGE_DESIGN_VERSION_HISTORY_LIMIT}");
    expect(appearance).toContain(".limit(PAGE_DESIGN_VERSION_HISTORY_LIMIT)");
  });

  it("uses Appearance as the canonical full-screen builder", () => {
    expect(appearance).toContain("<DesignEditor");
    expect(appearance).toContain("initialPublishedDesign={publishedDesign}");
    expect(legacyRoute).toContain("redirect(\`/organization/pages/\${pageId}/appearance\`)");
    expect(editor).toContain("Visual designer");
  });

  it("provides responsive canvas placement and inheritance controls", () => {
    expect(editor).toContain("ResponsiveGridCanvas");
    expect(editor).toContain("GridPlacementControls");
    expect(editor).toContain("PAGE_GRID_COLUMNS[breakpoint]");
    expect(editor).toContain("Reset to desktop inheritance");
    expect(editor).toContain("resetPageGridBreakpoint");
    expect(editor).toContain("updatePageGridPlacement");
  });

  it("applies starting points as layout-only draft changes", () => {
    expect(editor).toContain("Starting points");
    expect(editor).toContain("applyPageTemplateLayout(design, key)");
    expect(editor).toContain("without replacing blocks, content, branding, or appearance");
    expect(editor).toContain("Starting point applied to the draft. Publish when ready.");
  });

  it("includes theme essentials, advanced appearance, and direct canvas selection", () => {
    expect(editor).toContain('label="Style preset"');
    expect(editor).toContain("Brand color");
    expect(editor).toContain("Visitor appearance");
    expect(editor).toContain("Advanced appearance");
    expect(editor).toContain('aria-label="Edit page header"');
    expect(editor).toContain('aria-label="Edit page footer"');
  });

  it("stages presentation assets and visitor links until publish", () => {
    expect(editor).toContain("staged");
    expect(editor).toContain("design.presentation.logoUrl");
    expect(editor).toContain("Terms of Service URL");
    expect(editor).toContain("Privacy Policy URL");
    expect(assets).toContain('request.nextUrl.searchParams.get("stage") === "1"');
    expect(actions).toContain("const presentation = design.presentation");
    expect(actions).toContain("pruneUnreferencedDesignerAssets");
  });

  it("supports undo, redo, import, reset, and version restore as draft operations", () => {
    expect(editor).toContain('aria-label="Undo design change"');
    expect(editor).toContain('aria-label="Redo design change"');
    expect(editor).toContain("commit(parsed)");
    expect(editor).toContain("function resetToDefaultDraft()");
    expect(editor).toContain("function restoreVersion(");
  });
});

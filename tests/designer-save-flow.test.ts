import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("simple appearance workflow", () => {
  const actions = source("app/admin/(protected)/pages/[pageId]/design/actions.ts");
  const editor = source("components/admin/SimpleAppearanceEditor.tsx");
  const appearance = source("app/admin/(protected)/pages/[pageId]/appearance/page.tsx");
  const assets = source("app/api/admin/pages/[pageId]/assets/route.ts");

  it("autosaves drafts and publishes through the existing fenced workflow", () => {
    expect(actions).toContain("export async function saveDesignDraft(");
    expect(actions).toContain("export async function publishDesignDraft(");
    expect(actions).toContain("withTransaction(");
    expect(actions).toContain("fenceActiveOrganizationMutation(");
    expect(editor).toContain("saveDesignDraft(page.id, design, revisionRef.current)");
    expect(editor).toContain("publishDesignDraft(page.id, revisionRef.current)");
    expect(editor).toContain("Draft autosaved");
  });

  it("uses Appearance as the canonical simple editor", () => {
    expect(appearance).toContain("<SimpleAppearanceEditor");
    expect(appearance).not.toContain("<DesignEditor");
    expect(editor).toContain("Choose a layout and add your brand.");
    expect(editor).toContain("Publish changes");
  });

  it("offers only the three approved layout choices", () => {
    for (const key of ["CENTERED_SUMMARY", "ILLUSTRATED_HERO", "DENSE_OPERATIONS"]) expect(editor).toContain(`key: \"${key}\"`);
    expect(editor).toContain("applyPageTemplateLayout(design, key)");
    expect(editor).toContain("It is preserved until you choose one of the layouts below.");
  });

  it("keeps style and brand assets while preserving the complete design document", () => {
    expect(editor).toContain("designWithThemePreset(design");
    expect(editor).toContain('aria-label="Brand color"');
    expect(editor).toContain('kind="LOGO"');
    expect(editor).toContain('kind="FAVICON"');
    expect(editor).toContain('kind="COVER"');
    expect(editor).toContain("staged");
    expect(editor).toContain("simple");
    expect(editor).toContain("next.presentation = { ...next.presentation, ...patch }");
    expect(assets).toContain('request.nextUrl.searchParams.get("stage") === "1"');
  });

  it("does not expose the responsive canvas or advanced designer controls", () => {
    for (const removedControl of ["ResponsiveGridCanvas", "DesignPreview", "ThemePanel", "ChromePanel", "VersionPanel", "Starting points", "Undo design change", "View live page ↗"]) {
      expect(editor).not.toContain(removedControl);
    }
    expect(appearance).not.toContain('selectFrom("pageDesignVersions")');
    expect(appearance).not.toContain('selectFrom("componentGroups")');
    expect(appearance).not.toContain('selectFrom("components")');
  });
});

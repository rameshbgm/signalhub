import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PageDesignShell } from "../components/public/PageDesignShell";
import {
  PAGE_TEMPLATE_KEYS,
  PAGE_THEME_PRESET_KEYS,
  designWithThemePreset,
  legacyPageDesign,
  movePageDesignBlock,
  statusPageDesignSchema,
  sameStatusPageDesign,
  templateDesign,
} from "../lib/page-design";
import { COMPONENT_STATUS_COLOR } from "../lib/status";

describe("status page design", () => {
  it("exposes the exact published version rendered by a public surface", () => {
    const html = renderToStaticMarkup(
      PageDesignShell({
        pageId: "page-1",
        publishedVersion: 12,
        design: templateDesign("CENTERED_SUMMARY"),
        language: "en",
        children: "Public content",
      })
    );

    expect(html).toContain('data-published-version="12"');
    expect(html).toContain('data-template="CENTERED_SUMMARY"');
  });

  it("ships a valid design for every curated template", () => {
    for (const key of PAGE_TEMPLATE_KEYS) {
      const design = templateDesign(key, "#123456");
      expect(statusPageDesignSchema.parse(design).templateKey).toBe(key);
      expect(design.theme.palette.brand).toBe("#123456");
    }
  });

  it("builds the uptime timeline composition used by the live public page", () => {
    const design = templateDesign("UPTIME_TIMELINE");
    const components = design.surfaces.status.primary.find((block) => block.type === "COMPONENT_STATUS");

    expect(design.templateKey).toBe("UPTIME_TIMELINE");
    expect(components?.type).toBe("COMPONENT_STATUS");
    expect(components?.type === "COMPONENT_STATUS" && components.settings.view).toBe("UPTIME");
    expect(components?.type === "COMPONENT_STATUS" && components.settings.showUptime).toBe(true);
  });

  it("ships ten valid theme presets including the default", () => {
    expect(PAGE_THEME_PRESET_KEYS).toHaveLength(10);
    expect(PAGE_THEME_PRESET_KEYS).toContain("DEFAULT");
    for (const key of PAGE_THEME_PRESET_KEYS) {
      const themed = designWithThemePreset(templateDesign("CENTERED_SUMMARY"), key);
      expect(statusPageDesignSchema.safeParse(themed).success).toBe(true);
      expect(themed.theme.palette.operational).toBe(COMPONENT_STATUS_COLOR.OPERATIONAL);
      expect(themed.theme.palette.degraded).toBe(COMPONENT_STATUS_COLOR.DEGRADED_PERFORMANCE);
      expect(themed.theme.palette.partialOutage).toBe(COMPONENT_STATUS_COLOR.PARTIAL_OUTAGE);
      expect(themed.theme.palette.majorOutage).toBe(COMPONENT_STATUS_COLOR.MAJOR_OUTAGE);
      expect(themed.theme.palette.maintenance).toBe(COMPONENT_STATUS_COLOR.UNDER_MAINTENANCE);
    }
  });

  it("detects unchanged normalized drafts before publishing a new version", () => {
    const published = templateDesign("CENTERED_SUMMARY");
    const draft = structuredClone(published);
    expect(sameStatusPageDesign(draft, published)).toBe(true);
    draft.theme.radius = "LARGE";
    expect(sameStatusPageDesign(draft, published)).toBe(false);
  });

  it("reorders composition blocks within a zone", () => {
    const design = templateDesign("CENTERED_SUMMARY");
    const [first, second] = design.surfaces.status.primary;
    const moved = movePageDesignBlock(design, "status", first.id, second.id);

    expect(moved?.design.surfaces.status.primary.slice(0, 2).map((block) => block.id)).toEqual([second.id, first.id]);
    expect(design.surfaces.status.primary[0].id).toBe(first.id);
  });

  it("moves composition blocks between zones", () => {
    const design = templateDesign("CENTERED_SUMMARY");
    const component = design.surfaces.status.primary.find((block) => block.type === "COMPONENT_STATUS");
    expect(component).toBeDefined();
    if (!component) return;

    const moved = movePageDesignBlock(design, "status", component.id, "zone-sidebar");

    expect(moved?.targetZone).toBe("sidebar");
    expect(moved?.design.surfaces.status.primary.some((block) => block.id === component.id)).toBe(false);
    expect(moved?.design.surfaces.status.sidebar.at(-1)?.id).toBe(component.id);
  });

  it("defaults older saved designs to the compatible component directory layout", () => {
    const design = templateDesign("CENTERED_SUMMARY");
    const components = design.surfaces.status.primary.find(
      (block) => block.type === "COMPONENT_STATUS"
    );
    expect(components?.type).toBe("COMPONENT_STATUS");
    if (components?.type !== "COMPONENT_STATUS") return;

    const olderSettings = { ...components.settings } as Partial<typeof components.settings>;
    delete olderSettings.uptimeStyle;
    delete olderSettings.uptimeSize;
    delete olderSettings.uptimeIcon;
    delete olderSettings.groupingEnabled;
    delete olderSettings.componentStyle;
    delete olderSettings.componentColumns;
    delete olderSettings.showSummary;
    components.settings = olderSettings as typeof components.settings;

    const parsed = statusPageDesignSchema.parse(design);
    const parsedComponents = parsed.surfaces.status.primary.find(
      (block) => block.type === "COMPONENT_STATUS"
    );
    expect(parsedComponents?.type).toBe("COMPONENT_STATUS");
    if (parsedComponents?.type !== "COMPONENT_STATUS") return;
    expect(parsedComponents.settings.uptimeStyle).toBe("ROUNDED");
    expect(parsedComponents.settings.uptimeSize).toBe("RESPONSIVE");
    expect(parsedComponents.settings.uptimeIcon).toBe("NONE");
    expect(parsedComponents.settings.groupingEnabled).toBe(false);
    expect(parsedComponents.settings.componentStyle).toBe("ROWS");
    expect(parsedComponents.settings.componentColumns).toBe(3);
    expect(parsedComponents.settings.showSummary).toBe(false);
  });

  it("allows every composition block to be removed from a draft", () => {
    const design = templateDesign("CENTERED_SUMMARY");
    design.surfaces.status.primary = design.surfaces.status.primary.filter(
      (block) => block.type !== "COMPONENT_STATUS"
    );
    const result = statusPageDesignSchema.safeParse(design);
    expect(result.success).toBe(true);
  });

  it("maps existing layouts and themes without dropping visitor preferences", () => {
    const cover = legacyPageDesign({
      layout: "COVER",
      brandColor: "#abcdef",
      themePreset: "CALM",
      themeMode: "DARK",
      allowThemeOverride: false,
    });
    expect(cover.templateKey).toBe("ILLUSTRATED_HERO");
    expect(cover.theme.mode).toBe("DARK");
    expect(cover.theme.allowVisitorMode).toBe(false);
    expect(cover.theme.palette.brand).toBe("#abcdef");
    expect(cover.theme.palette.background).toBe("#f7f7f4");
  });

  it("rejects executable or malformed portable design content", () => {
    const design = templateDesign("MINIMAL_ENTERPRISE");
    design.chrome.header.links = [{ label: "Unsafe", url: "javascript:alert(1)" }];
    expect(statusPageDesignSchema.safeParse(design).success).toBe(false);
  });

  it("keeps repeated block types independent across public surfaces", () => {
    const design = templateDesign("CENTERED_SUMMARY");
    const statusOverall = design.surfaces.status.full.find((block) => block.type === "OVERALL_STATUS");
    const hubOverall = design.surfaces.hub.full.find((block) => block.type === "OVERALL_STATUS");
    expect(statusOverall?.id).not.toBe(hubOverall?.id);
    if (statusOverall?.type === "OVERALL_STATUS") statusOverall.settings.style = "SOLID";
    expect(hubOverall?.type === "OVERALL_STATUS" && hubOverall.settings.style).toBe("PANEL");
  });
});

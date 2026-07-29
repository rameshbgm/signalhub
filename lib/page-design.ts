import { z } from "zod";
import { COMPONENT_STATUS_COLOR } from "@/lib/status";

export const PAGE_DESIGN_SCHEMA_VERSION = 1 as const;

export const UPTIME_BAR_STYLES = ["ROUNDED", "SQUARE", "PILL", "SOLID"] as const;
export type UptimeBarStyle = (typeof UPTIME_BAR_STYLES)[number];
export const UPTIME_BAR_SIZES = ["RESPONSIVE", "COMPACT", "BLOCKS"] as const;
export type UptimeBarSize = (typeof UPTIME_BAR_SIZES)[number];
export const UPTIME_ICON_STYLES = ["NONE", "DOT", "STATUS"] as const;
export type UptimeIconStyle = (typeof UPTIME_ICON_STYLES)[number];

export const PAGE_THEME_PRESET_KEYS = [
  "DEFAULT",
  "OCEAN",
  "MIDNIGHT",
  "EMERALD",
  "SUNSET",
  "VIOLET",
  "SLATE",
  "HIGH_CONTRAST",
  "WARM_PAPER",
  "SOFT_BLUE",
] as const;
export type PageThemePresetKey = (typeof PAGE_THEME_PRESET_KEYS)[number];

export const PAGE_THEME_PRESET_LABELS: Record<PageThemePresetKey, string> = {
  DEFAULT: "Default",
  OCEAN: "Ocean",
  MIDNIGHT: "Midnight",
  EMERALD: "Emerald",
  SUNSET: "Sunset",
  VIOLET: "Violet",
  SLATE: "Slate",
  HIGH_CONTRAST: "High contrast",
  WARM_PAPER: "Warm paper",
  SOFT_BLUE: "Soft blue",
};

export const PAGE_THEME_PRESET_DESCRIPTIONS: Record<PageThemePresetKey, string> = {
  DEFAULT: "Balanced neutral styling with the SignalHub teal accent.",
  OCEAN: "Clear blues and cyan accents for infrastructure and network pages.",
  MIDNIGHT: "A dark operations theme designed for low-light dashboards.",
  EMERALD: "Calm greens with strong operational-state emphasis.",
  SUNSET: "Warm orange and amber accents with an inviting surface palette.",
  VIOLET: "A modern purple and pink brand treatment with soft backgrounds.",
  SLATE: "Restrained enterprise neutrals with understated elevation.",
  HIGH_CONTRAST: "Maximum text and control contrast with square, flat surfaces.",
  WARM_PAPER: "Soft cream surfaces and earthy accents for a human tone.",
  SOFT_BLUE: "A bright, approachable blue theme with comfortable spacing.",
};

export const PAGE_TEMPLATE_KEYS = [
  "CENTERED_SUMMARY",
  "BANNER_SPOTLIGHT",
  "UPTIME_TIMELINE",
  "ILLUSTRATED_HERO",
  "GROUPED_DIRECTORY",
  "PRODUCT_GRID",
  "DENSE_OPERATIONS",
  "MINIMAL_ENTERPRISE",
] as const;

export const PAGE_DESIGN_VERSION_HISTORY_LIMIT = 30;

export type PageTemplateKey = (typeof PAGE_TEMPLATE_KEYS)[number];

export function sameStatusPageDesign(left: unknown, right: unknown) {
  return JSON.stringify(statusPageDesignSchema.parse(left)) === JSON.stringify(statusPageDesignSchema.parse(right));
}

export const PAGE_TEMPLATE_LABELS: Record<PageTemplateKey, string> = {
  CENTERED_SUMMARY: "Centered summary",
  BANNER_SPOTLIGHT: "Banner spotlight",
  UPTIME_TIMELINE: "Uptime timeline",
  ILLUSTRATED_HERO: "Illustrated hero",
  GROUPED_DIRECTORY: "Grouped directory",
  PRODUCT_GRID: "Product grid",
  DENSE_OPERATIONS: "Dense operations",
  MINIMAL_ENTERPRISE: "Minimal enterprise",
};

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, "Use a six-digit hex color");
const httpUrl = z.string().url().refine((value) => /^https?:\/\//i.test(value), "Use an HTTP(S) URL");
const imageUrl = z.string().refine(
  (value) => /^https?:\/\//i.test(value) || /^\/api\/assets\/[a-f0-9]{24}$/i.test(value),
  "Use an HTTP(S) or uploaded asset URL"
);
const blockId = z.string().min(1).max(80);
const commonBlock = {
  id: blockId,
  hidden: z.boolean().default(false),
};

export const pageDesignBlockSchema = z.discriminatedUnion("type", [
  z.object({
    ...commonBlock,
    type: z.literal("OVERALL_STATUS"),
    settings: z.object({
      style: z.enum(["PANEL", "SOLID", "CENTERED", "COMPACT"]).default("PANEL"),
      showLastUpdated: z.boolean().default(true),
      showDescription: z.boolean().default(true),
    }),
  }),
  z.object({
    ...commonBlock,
    type: z.literal("ANNOUNCEMENTS"),
    settings: z.object({ maxItems: z.number().int().min(1).max(10).default(3) }),
  }),
  z.object({
    ...commonBlock,
    type: z.literal("RICH_TEXT"),
    settings: z.object({
      heading: z.string().max(160).default(""),
      body: z.string().max(20_000).default(""),
      align: z.enum(["LEFT", "CENTER"]).default("LEFT"),
    }),
  }),
  z.object({
    ...commonBlock,
    type: z.literal("COMPONENT_STATUS"),
    settings: z.object({
      view: z.enum(["LIST", "CARDS", "GRID", "COMPACT", "UPTIME"]).default("LIST"),
      uptimeDays: z.union([z.literal(30), z.literal(60), z.literal(90)]).default(90),
      uptimeStyle: z.enum(UPTIME_BAR_STYLES).default("ROUNDED"),
      uptimeSize: z.enum(UPTIME_BAR_SIZES).default("RESPONSIVE"),
      uptimeIcon: z.enum(UPTIME_ICON_STYLES).default("NONE"),
      groupStyle: z.enum(["ACCORDION", "SECTIONS", "CARDS"]).default("ACCORDION"),
      groupingEnabled: z.boolean().default(false),
      componentStyle: z.enum(["ROWS", "PILLS"]).default("ROWS"),
      componentColumns: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(3),
      showSummary: z.boolean().default(false),
      showLegend: z.boolean().default(false),
      showDescriptions: z.boolean().default(true),
      showUptime: z.boolean().default(true),
      searchEnabled: z.boolean().default(false),
    }),
  }),
  z.object({
    ...commonBlock,
    type: z.literal("ACTIVE_INCIDENTS"),
    settings: z.object({ heading: z.string().max(120).default("Active incidents") }),
  }),
  z.object({
    ...commonBlock,
    type: z.literal("SCHEDULED_MAINTENANCE"),
    settings: z.object({ heading: z.string().max(120).default("Scheduled maintenance") }),
  }),
  z.object({
    ...commonBlock,
    type: z.literal("METRICS"),
    settings: z.object({
      heading: z.string().max(120).default("System metrics"),
      columns: z.union([z.literal(1), z.literal(2)]).default(2),
    }),
  }),
  z.object({
    ...commonBlock,
    type: z.literal("HISTORY_PREVIEW"),
    settings: z.object({
      heading: z.string().max(120).default("Past incidents"),
      days: z.union([z.literal(7), z.literal(14), z.literal(30)]).default(14),
    }),
  }),
  z.object({
    ...commonBlock,
    type: z.literal("SUBSCRIBE"),
    settings: z.object({
      style: z.enum(["BUTTON", "PANEL", "INLINE"]).default("BUTTON"),
      heading: z.string().max(120).default("Subscribe to updates"),
    }),
  }),
  z.object({
    ...commonBlock,
    type: z.literal("LINK_CARDS"),
    settings: z.object({
      links: z
        .array(
          z.object({
            label: z.string().min(1).max(80),
            description: z.string().max(240).default(""),
            url: httpUrl,
          })
        )
        .max(12)
        .default([]),
    }),
  }),
  z.object({
    ...commonBlock,
    type: z.literal("HISTORY_LIST"),
    settings: z.object({ showMaintenance: z.boolean().default(true) }),
  }),
  z.object({
    ...commonBlock,
    type: z.literal("INCIDENT_DETAIL"),
    settings: z.object({
      showAffectedComponents: z.boolean().default(true),
      showPostmortem: z.boolean().default(true),
    }),
  }),
  z.object({
    ...commonBlock,
    type: z.literal("ACCESS_FORM"),
    settings: z.object({ style: z.enum(["CARD", "CENTERED"]).default("CARD") }),
  }),
  z.object({
    ...commonBlock,
    type: z.literal("HUB_GRID"),
    settings: z.object({
      columns: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
      showDescriptions: z.boolean().default(true),
    }),
  }),
]);

export type PageDesignBlock = z.infer<typeof pageDesignBlockSchema>;

const surfaceSchema = z.object({
  full: z.array(pageDesignBlockSchema).max(30).default([]),
  primary: z.array(pageDesignBlockSchema).max(30).default([]),
  sidebar: z.array(pageDesignBlockSchema).max(20).default([]),
});

const headerItemSchema = z.object({
  id: blockId,
  type: z.enum(["LOGO", "TITLE", "HUB_LINK", "NAVIGATION", "SUPPORT", "SUBSCRIBE", "THEME_TOGGLE"]),
  hidden: z.boolean().default(false),
});

const footerItemSchema = z.object({
  id: blockId,
  type: z.enum(["CUSTOM_TEXT", "LINKS", "LEGAL", "BRANDING", "COPYRIGHT"]),
  hidden: z.boolean().default(false),
});

export const statusPageDesignSchema = z
  .object({
    schemaVersion: z.literal(PAGE_DESIGN_SCHEMA_VERSION),
    templateKey: z.enum(PAGE_TEMPLATE_KEYS),
    theme: z.object({
      preset: z.enum(PAGE_THEME_PRESET_KEYS).default("DEFAULT"),
      mode: z.enum(["SYSTEM", "LIGHT", "DARK"]).default("SYSTEM"),
      allowVisitorMode: z.boolean().default(true),
      palette: z.object({
        brand: hexColor,
        accent: hexColor,
        background: hexColor,
        surface: hexColor,
        text: hexColor,
        mutedText: hexColor,
        operational: hexColor,
        degraded: hexColor,
        partialOutage: hexColor,
        majorOutage: hexColor,
        maintenance: hexColor,
      }),
      darkPalette: z.object({
        background: hexColor,
        surface: hexColor,
        text: hexColor,
        mutedText: hexColor,
      }),
      typography: z.enum(["SYSTEM", "HUMANIST", "GEOMETRIC", "MONO"]).default("SYSTEM"),
      density: z.enum(["COMPACT", "COMFORTABLE", "SPACIOUS"]).default("COMFORTABLE"),
      contentWidth: z.enum(["NARROW", "STANDARD", "WIDE"]).default("STANDARD"),
      radius: z.enum(["NONE", "SMALL", "MEDIUM", "LARGE"]).default("MEDIUM"),
      shadow: z.enum(["NONE", "SUBTLE", "ELEVATED"]).default("SUBTLE"),
    }),
    chrome: z.object({
      header: z.object({
        variant: z.enum(["STANDARD", "CENTERED", "HERO", "MINIMAL"]).default("STANDARD"),
        sticky: z.boolean().default(false),
        items: z.array(headerItemSchema).max(12),
        links: z
          .array(z.object({ label: z.string().min(1).max(80), url: httpUrl }))
          .max(12)
          .default([]),
      }),
      footer: z.object({
        items: z.array(footerItemSchema).max(12),
        customText: z.string().max(500).default(""),
        links: z
          .array(z.object({ label: z.string().min(1).max(80), url: httpUrl }))
          .max(12)
          .default([]),
      }),
    }),
    surfaces: z.object({
      status: surfaceSchema,
      history: surfaceSchema,
      incident: surfaceSchema,
      access: surfaceSchema,
      hub: surfaceSchema,
      embed: surfaceSchema,
    }),
    seo: z.object({
      title: z.string().max(160).default(""),
      description: z.string().max(320).default(""),
      socialImageUrl: imageUrl.nullable().default(null),
      noIndex: z.boolean().default(false),
    }),
  })
  .superRefine((design, context) => {
    const contrastPairs: Array<[string, string, string]> = [
      [design.theme.palette.text, design.theme.palette.background, "Light text/background"],
      [design.theme.palette.text, design.theme.palette.surface, "Light text/surface"],
      [design.theme.darkPalette.text, design.theme.darkPalette.background, "Dark text/background"],
      [design.theme.darkPalette.text, design.theme.darkPalette.surface, "Dark text/surface"],
    ];
    for (const [foreground, background, label] of contrastPairs) {
      if (contrastRatio(foreground, background) < 4.5) {
        context.addIssue({
          code: "custom",
          path: ["theme"],
          message: `${label} contrast must meet WCAG AA`,
        });
      }
    }
  });

export type StatusPageDesign = z.infer<typeof statusPageDesignSchema>;
export type PageSurfaceKey = keyof StatusPageDesign["surfaces"];
export type PageDesignZone = keyof StatusPageDesign["surfaces"]["status"];

export function movePageDesignBlock(
  design: StatusPageDesign,
  surface: PageSurfaceKey,
  activeId: string,
  overId: string
) {
  const zoneKeys: PageDesignZone[] = ["full", "primary", "sidebar"];
  const sourceZone = zoneKeys.find((zone) => design.surfaces[surface][zone].some((block) => block.id === activeId));
  const targetZone = overId.startsWith("zone-")
    ? zoneKeys.find((zone) => zone === overId.slice(5))
    : zoneKeys.find((zone) => design.surfaces[surface][zone].some((block) => block.id === overId));
  if (!sourceZone || !targetZone) return null;
  const sourceIndex = design.surfaces[surface][sourceZone].findIndex((block) => block.id === activeId);
  const targetIndex = overId.startsWith("zone-")
    ? design.surfaces[surface][targetZone].length
    : design.surfaces[surface][targetZone].findIndex((block) => block.id === overId);
  if (sourceIndex < 0 || targetIndex < 0 || (sourceZone === targetZone && sourceIndex === targetIndex)) return null;

  const next = structuredClone(design);
  const [moved] = next.surfaces[surface][sourceZone].splice(sourceIndex, 1);
  next.surfaces[surface][targetZone].splice(targetIndex, 0, moved);
  return { design: next, moved, sourceZone, targetZone };
}

const b = <T extends PageDesignBlock>(block: T) => block;
const standardHeader = [
  { id: "header-logo", type: "LOGO" as const, hidden: false },
  { id: "header-title", type: "TITLE" as const, hidden: false },
  { id: "header-hub", type: "HUB_LINK" as const, hidden: false },
  { id: "header-navigation", type: "NAVIGATION" as const, hidden: false },
  { id: "header-support", type: "SUPPORT" as const, hidden: false },
  { id: "header-subscribe", type: "SUBSCRIBE" as const, hidden: true },
  { id: "header-theme", type: "THEME_TOGGLE" as const, hidden: false },
];
const standardFooter = [
  { id: "footer-text", type: "CUSTOM_TEXT" as const, hidden: true },
  { id: "footer-links", type: "LINKS" as const, hidden: false },
  { id: "footer-legal", type: "LEGAL" as const, hidden: false },
  { id: "footer-branding", type: "BRANDING" as const, hidden: false },
  { id: "footer-copyright", type: "COPYRIGHT" as const, hidden: false },
];

function baseDesign(templateKey: PageTemplateKey, brand = "#0f8ca8"): StatusPageDesign {
  const overall = (id: string) => b({
    id,
    type: "OVERALL_STATUS" as const,
    hidden: false,
    settings: { style: "PANEL" as const, showLastUpdated: true, showDescription: true },
  });
  const components = b({
    id: "component-status",
    type: "COMPONENT_STATUS",
    hidden: false,
    settings: {
      view: "LIST",
      uptimeDays: 90,
      uptimeStyle: "ROUNDED",
      uptimeSize: "RESPONSIVE",
      uptimeIcon: "NONE",
      groupStyle: "ACCORDION",
      groupingEnabled: false,
      componentStyle: "ROWS",
      componentColumns: 3,
      showSummary: false,
      showLegend: false,
      showDescriptions: true,
      showUptime: true,
      searchEnabled: false,
    },
  });
  return {
    schemaVersion: 1,
    templateKey,
    theme: {
      preset: "DEFAULT",
      mode: "SYSTEM",
      allowVisitorMode: true,
      palette: {
        brand,
        accent: brand,
        background: "#f5f7fb",
        surface: "#ffffff",
        text: "#132033",
        mutedText: "#526174",
        operational: COMPONENT_STATUS_COLOR.OPERATIONAL,
        degraded: COMPONENT_STATUS_COLOR.DEGRADED_PERFORMANCE,
        partialOutage: COMPONENT_STATUS_COLOR.PARTIAL_OUTAGE,
        majorOutage: COMPONENT_STATUS_COLOR.MAJOR_OUTAGE,
        maintenance: COMPONENT_STATUS_COLOR.UNDER_MAINTENANCE,
      },
      darkPalette: {
        background: "#090d13",
        surface: "#111720",
        text: "#edf3f8",
        mutedText: "#a2adba",
      },
      typography: "SYSTEM",
      density: "COMFORTABLE",
      contentWidth: "STANDARD",
      radius: "MEDIUM",
      shadow: "SUBTLE",
    },
    chrome: {
      header: { variant: "STANDARD", sticky: false, items: standardHeader, links: [] },
      footer: { items: standardFooter, customText: "", links: [] },
    },
    surfaces: {
      status: {
        full: [
          overall("overall-status"),
          b({ id: "announcements", type: "ANNOUNCEMENTS", hidden: false, settings: { maxItems: 3 } }),
        ],
        primary: [
          b({ id: "active-incidents", type: "ACTIVE_INCIDENTS", hidden: false, settings: { heading: "Active incidents" } }),
          components,
          b({ id: "metrics", type: "METRICS", hidden: false, settings: { heading: "System metrics", columns: 2 } }),
          b({ id: "history-preview", type: "HISTORY_PREVIEW", hidden: false, settings: { heading: "Past incidents", days: 14 } }),
        ],
        sidebar: [
          b({ id: "subscribe", type: "SUBSCRIBE", hidden: false, settings: { style: "PANEL", heading: "Subscribe to updates" } }),
          b({ id: "maintenance", type: "SCHEDULED_MAINTENANCE", hidden: false, settings: { heading: "Scheduled maintenance" } }),
        ],
      },
      history: {
        full: [b({ id: "history-list", type: "HISTORY_LIST", hidden: false, settings: { showMaintenance: true } })],
        primary: [],
        sidebar: [],
      },
      incident: {
        full: [b({ id: "incident-detail", type: "INCIDENT_DETAIL", hidden: false, settings: { showAffectedComponents: true, showPostmortem: true } })],
        primary: [],
        sidebar: [],
      },
      access: {
        full: [b({ id: "access-form", type: "ACCESS_FORM", hidden: false, settings: { style: "CARD" } })],
        primary: [],
        sidebar: [],
      },
      hub: {
        full: [
          overall("hub-overall-status"),
          b({ id: "hub-announcements", type: "ANNOUNCEMENTS", hidden: false, settings: { maxItems: 3 } }),
          b({ id: "hub-grid", type: "HUB_GRID", hidden: false, settings: { columns: 2, showDescriptions: true } }),
        ],
        primary: [],
        sidebar: [],
      },
      embed: { full: [overall("embed-overall-status")], primary: [], sidebar: [] },
    },
    seo: { title: "", description: "", socialImageUrl: null, noIndex: false },
  };
}

export function templateDesign(templateKey: PageTemplateKey, brand = "#0f8ca8"): StatusPageDesign {
  const design = baseDesign(templateKey, brand);
  const components = design.surfaces.status.primary.find((block) => block.type === "COMPONENT_STATUS");
  switch (templateKey) {
    case "CENTERED_SUMMARY":
      design.chrome.header.variant = "CENTERED";
      design.surfaces.status.full[0].settings = { style: "CENTERED", showLastUpdated: true, showDescription: true };
      break;
    case "BANNER_SPOTLIGHT":
      design.chrome.header.variant = "STANDARD";
      design.theme.contentWidth = "WIDE";
      design.theme.density = "SPACIOUS";
      design.surfaces.status.full[0].settings = { style: "CENTERED", showLastUpdated: true, showDescription: true };
      break;
    case "UPTIME_TIMELINE":
      if (components?.type === "COMPONENT_STATUS") {
        components.settings.view = "UPTIME";
        components.settings.groupStyle = "SECTIONS";
      }
      design.theme.contentWidth = "WIDE";
      break;
    case "ILLUSTRATED_HERO":
      design.chrome.header.variant = "HERO";
      design.theme.density = "SPACIOUS";
      design.surfaces.status.full[0].settings = { style: "SOLID", showLastUpdated: true, showDescription: true };
      break;
    case "GROUPED_DIRECTORY":
      if (components?.type === "COMPONENT_STATUS") {
        components.settings.view = "LIST";
        components.settings.groupStyle = "ACCORDION";
        components.settings.searchEnabled = true;
        components.settings.showUptime = false;
      }
      design.theme.contentWidth = "WIDE";
      break;
    case "PRODUCT_GRID":
      if (components?.type === "COMPONENT_STATUS") {
        components.settings.view = "GRID";
        components.settings.groupStyle = "CARDS";
        components.settings.showUptime = false;
      }
      design.theme.contentWidth = "WIDE";
      break;
    case "DENSE_OPERATIONS":
      design.theme.mode = "DARK";
      design.theme.density = "COMPACT";
      design.theme.contentWidth = "WIDE";
      design.theme.radius = "SMALL";
      if (components?.type === "COMPONENT_STATUS") components.settings.view = "CARDS";
      break;
    case "MINIMAL_ENTERPRISE":
      design.chrome.header.variant = "MINIMAL";
      design.theme.radius = "NONE";
      design.theme.shadow = "NONE";
      design.surfaces.status.full[0].settings = { style: "SOLID", showLastUpdated: true, showDescription: false };
      if (components?.type === "COMPONENT_STATUS") components.settings.showUptime = false;
      break;
  }
  return statusPageDesignSchema.parse(design);
}

export function pageThemePreset(key: PageThemePresetKey): StatusPageDesign["theme"] {
  const theme = structuredClone(baseDesign("CENTERED_SUMMARY").theme);
  theme.preset = key;
  switch (key) {
    case "DEFAULT":
      return theme;
    case "OCEAN":
      theme.palette = { ...theme.palette, brand: "#0369a1", accent: "#22a6c7", background: "#f0f9ff", surface: "#ffffff", text: "#0c3b58", mutedText: "#527086" };
      theme.darkPalette = { background: "#06131d", surface: "#0c2230", text: "#e5f6ff", mutedText: "#9bc0d2" };
      theme.radius = "LARGE";
      return theme;
    case "MIDNIGHT":
      theme.mode = "DARK";
      theme.palette = { ...theme.palette, brand: "#60a5fa", accent: "#a78bfa", background: "#070b14", surface: "#111827", text: "#f8fafc", mutedText: "#a9b4c5" };
      theme.darkPalette = { background: "#070b14", surface: "#111827", text: "#f8fafc", mutedText: "#a9b4c5" };
      theme.shadow = "ELEVATED";
      return theme;
    case "EMERALD":
      theme.palette = { ...theme.palette, brand: "#047857", accent: "#22a875", background: "#f0fdf4", surface: "#ffffff", text: "#064e3b", mutedText: "#557568" };
      theme.darkPalette = { background: "#061612", surface: "#0d2820", text: "#ecfdf5", mutedText: "#9bc6b6" };
      theme.radius = "LARGE";
      return theme;
    case "SUNSET":
      theme.palette = { ...theme.palette, brand: "#c2410c", accent: "#e79b13", background: "#fff7ed", surface: "#ffffff", text: "#5a2411", mutedText: "#8a6252" };
      theme.darkPalette = { background: "#1b0d08", surface: "#2b1710", text: "#fff7ed", mutedText: "#d8aa96" };
      theme.typography = "HUMANIST";
      return theme;
    case "VIOLET":
      theme.palette = { ...theme.palette, brand: "#7c3aed", accent: "#db2777", background: "#faf5ff", surface: "#ffffff", text: "#3b1768", mutedText: "#755e8e" };
      theme.darkPalette = { background: "#130b20", surface: "#221335", text: "#faf5ff", mutedText: "#c2add8" };
      theme.radius = "LARGE";
      theme.shadow = "ELEVATED";
      return theme;
    case "SLATE":
      theme.palette = { ...theme.palette, brand: "#334155", accent: "#64748b", background: "#f8fafc", surface: "#ffffff", text: "#0f172a", mutedText: "#64748b" };
      theme.darkPalette = { background: "#0f172a", surface: "#1e293b", text: "#f8fafc", mutedText: "#a8b3c4" };
      theme.radius = "SMALL";
      theme.shadow = "NONE";
      return theme;
    case "HIGH_CONTRAST":
      theme.palette = { ...theme.palette, brand: "#005fcc", accent: "#005fcc", background: "#ffffff", surface: "#ffffff", text: "#000000", mutedText: "#333333" };
      theme.darkPalette = { background: "#000000", surface: "#0a0a0a", text: "#ffffff", mutedText: "#d1d1d1" };
      theme.radius = "NONE";
      theme.shadow = "NONE";
      return theme;
    case "WARM_PAPER":
      theme.palette = { ...theme.palette, brand: "#9a3412", accent: "#b7791f", background: "#fffaf0", surface: "#fffef9", text: "#422006", mutedText: "#82644c" };
      theme.darkPalette = { background: "#1a1009", surface: "#2a1b10", text: "#fffaf0", mutedText: "#d5b99e" };
      theme.typography = "HUMANIST";
      theme.radius = "SMALL";
      return theme;
    case "SOFT_BLUE":
      theme.palette = { ...theme.palette, brand: "#2563eb", accent: "#0891b2", background: "#f5f7ff", surface: "#ffffff", text: "#172554", mutedText: "#63709a" };
      theme.darkPalette = { background: "#09112b", surface: "#111d3f", text: "#eef2ff", mutedText: "#a9b5d8" };
      theme.density = "SPACIOUS";
      theme.radius = "LARGE";
      return theme;
  }
}

export function designWithThemePreset(design: StatusPageDesign, key: PageThemePresetKey) {
  const next = structuredClone(design);
  const mode = next.theme.mode;
  const allowVisitorMode = next.theme.allowVisitorMode;
  next.theme = pageThemePreset(key);
  // Presets are color/appearance systems. Color mode and visitor override are
  // independent choices and must survive a preset change.
  next.theme.mode = mode;
  next.theme.allowVisitorMode = allowVisitorMode;
  return statusPageDesignSchema.parse(next);
}

export function legacyPageDesign(page: {
  brandColor?: string | null;
  layout?: string | null;
  themePreset?: string | null;
  themeMode?: string | null;
  allowThemeOverride?: boolean | null;
}): StatusPageDesign {
  const templateKey: PageTemplateKey =
    PAGE_TEMPLATE_KEYS.includes(page.layout as PageTemplateKey)
      ? (page.layout as PageTemplateKey)
      : page.layout === "COVER"
      ? "ILLUSTRATED_HERO"
      : page.layout === "MINIMAL"
        ? "MINIMAL_ENTERPRISE"
        : "CENTERED_SUMMARY";
  const design = templateDesign(templateKey, page.brandColor || "#0f8ca8");
  design.theme.mode = ["SYSTEM", "LIGHT", "DARK"].includes(page.themeMode ?? "")
    ? (page.themeMode as "SYSTEM" | "LIGHT" | "DARK")
    : "SYSTEM";
  design.theme.allowVisitorMode = page.allowThemeOverride ?? true;
  if (PAGE_THEME_PRESET_KEYS.includes(page.themePreset as PageThemePresetKey)) {
    const presetDesign = designWithThemePreset(design, page.themePreset as PageThemePresetKey);
    presetDesign.theme.mode = design.theme.mode;
    presetDesign.theme.allowVisitorMode = design.theme.allowVisitorMode;
    return presetDesign;
  }
  if (page.themePreset === "CALM") {
    design.theme.palette.background = "#f7f7f4";
    design.theme.palette.surface = "#fffefa";
    design.theme.palette.text = "#20221f";
    design.theme.palette.mutedText = "#5e625b";
  } else if (page.themePreset === "CONTRAST") {
    design.theme.palette.background = "#ffffff";
    design.theme.palette.surface = "#ffffff";
    design.theme.palette.text = "#070b12";
    design.theme.palette.mutedText = "#344054";
  }
  return statusPageDesignSchema.parse(design);
}

export function pageDesignFor(page: {
  publishedDesign?: unknown;
  brandColor?: string | null;
  layout?: string | null;
  themePreset?: string | null;
  themeMode?: string | null;
  allowThemeOverride?: boolean | null;
}) {
  const parsed = statusPageDesignSchema.safeParse(page.publishedDesign);
  return parsed.success ? parsed.data : legacyPageDesign(page);
}

export function allSurfaceBlocks(design: StatusPageDesign, surface: PageSurfaceKey) {
  return [
    ...design.surfaces[surface].full,
    ...design.surfaces[surface].primary,
    ...design.surfaces[surface].sidebar,
  ];
}

function contrastRatio(foreground: string, background: string) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function luminance(color: string) {
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

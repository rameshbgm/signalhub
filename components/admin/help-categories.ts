import { Activity, BookOpen, Building2, Code2, LayoutDashboard, Landmark, Megaphone, Palette, Siren, type LucideIcon } from "lucide-react";
import type { Hue } from "@/components/ui/icon-tile";

/** Presentation for each help category; `lib/help-content.ts` only carries a text glyph. */
export const HELP_CATEGORY_STYLE: Record<string, { icon: LucideIcon; hue: Hue }> = {
  overview: { icon: LayoutDashboard, hue: "indigo" },
  incidents: { icon: Siren, hue: "amber" },
  communicate: { icon: Megaphone, hue: "emerald" },
  organization: { icon: Building2, hue: "slate" },
  pages: { icon: Palette, hue: "violet" },
  monitoring: { icon: Activity, hue: "sky" },
  developers: { icon: Code2, hue: "teal" },
  platform: { icon: Landmark, hue: "violet" },
};

export const HELP_CATEGORY_FALLBACK: { icon: LucideIcon; hue: Hue } = { icon: BookOpen, hue: "slate" };

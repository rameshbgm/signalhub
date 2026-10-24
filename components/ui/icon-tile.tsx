import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Hue = "indigo" | "sky" | "emerald" | "amber" | "rose" | "violet" | "teal" | "slate";

const sizes = { sm: 16, md: 20, lg: 26 } as const;

/** A bare icon in its hue colour (no tile behind it). Colours come from `[data-hue]` in app/theme.css. */
export function IconTile({ icon: Icon, hue = "indigo", size = "md", className }: { icon: LucideIcon; hue?: Hue; size?: keyof typeof sizes; className?: string }) {
  return (
    <span data-hue={hue} aria-hidden="true" className={cn("inline-flex shrink-0 items-center justify-center text-[var(--hue-fg)]", className)}>
      <Icon size={sizes[size]} />
    </span>
  );
}

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Hue = "indigo" | "sky" | "emerald" | "amber" | "rose" | "violet" | "teal" | "slate";

const sizes = {
  sm: { box: "size-8 rounded-control", icon: 16 },
  md: { box: "size-10 rounded-control", icon: 20 },
  lg: { box: "size-12 rounded-card", icon: 24 },
} as const;

/** A tinted square that carries one icon. Colours come from `[data-hue]` in app/theme.css. */
export function IconTile({ icon: Icon, hue = "indigo", size = "md", className }: { icon: LucideIcon; hue?: Hue; size?: keyof typeof sizes; className?: string }) {
  return (
    <span data-hue={hue} aria-hidden="true" className={cn("inline-grid shrink-0 place-items-center bg-[var(--hue-bg)] text-[var(--hue-fg)] ring-1 ring-inset ring-black/5", sizes[size].box, className)}>
      <Icon size={sizes[size].icon} />
    </span>
  );
}

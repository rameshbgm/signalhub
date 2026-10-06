import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Hue = "indigo" | "sky" | "emerald" | "amber" | "rose" | "violet" | "teal" | "slate";

const sizes = {
  sm: { box: "size-7 rounded-control", icon: 15 },
  md: { box: "size-9 rounded-[0.5rem]", icon: 18 },
  lg: { box: "size-11 rounded-[0.625rem]", icon: 22 },
} as const;

/** A gradient tile that carries one white icon. Colours come from `[data-hue]` in app/theme.css. */
export function IconTile({ icon: Icon, hue = "indigo", size = "md", className }: { icon: LucideIcon; hue?: Hue; size?: keyof typeof sizes; className?: string }) {
  return (
    <span
      data-hue={hue}
      aria-hidden="true"
      className={cn(
        "relative inline-grid shrink-0 place-items-center bg-gradient-to-br from-[var(--hue-from)] to-[var(--hue-to)] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]",
        sizes[size].box,
        className,
      )}
    >
      <Icon size={sizes[size].icon} />
    </span>
  );
}

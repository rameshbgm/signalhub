import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Hue = "indigo" | "sky" | "emerald" | "amber" | "rose" | "violet" | "teal" | "slate";

const sizes = {
  sm: { box: "size-8 rounded-[0.7rem]", icon: 16 },
  md: { box: "size-10 rounded-[0.9rem]", icon: 20 },
  lg: { box: "size-12 rounded-[1.1rem]", icon: 24 },
} as const;

/** A gradient orb that carries one white icon. Colours come from `[data-hue]` in app/theme.css. */
export function IconTile({ icon: Icon, hue = "indigo", size = "md", className }: { icon: LucideIcon; hue?: Hue; size?: keyof typeof sizes; className?: string }) {
  return (
    <span
      data-hue={hue}
      aria-hidden="true"
      className={cn(
        "relative inline-grid shrink-0 place-items-center bg-gradient-to-br from-[var(--hue-from)] to-[var(--hue-to)] text-white shadow-[0_6px_14px_-6px_var(--hue-to),inset_0_1px_0_rgb(255_255_255/0.35)]",
        sizes[size].box,
        className,
      )}
    >
      <Icon size={sizes[size].icon} />
    </span>
  );
}

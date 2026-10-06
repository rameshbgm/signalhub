import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { IconTile, type Hue } from "@/components/ui/icon-tile";
import { cn } from "@/lib/utils";

/** An empty screen is an invitation: say what belongs here and offer the next step. */
export function EmptyState({ icon, hue = "indigo", title, description, action, className }: { icon: LucideIcon; hue?: Hue; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center rounded-card border border-dashed border-line-strong bg-sunken/40 px-6 py-12 text-center", className)}>
      <IconTile icon={icon} hue={hue} size="lg" />
      <h2 className="mt-4 text-[0.9375rem] font-semibold text-ink">{title}</h2>
      {description && <p className="mt-1 max-w-sm text-sm leading-6 text-ink-soft">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

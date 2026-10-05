import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { IconTile, type Hue } from "@/components/ui/icon-tile";
import { cn } from "@/lib/utils";

/** An empty screen is an invitation: say what belongs here and offer the next step. */
export function EmptyState({ icon, hue = "indigo", title, description, action, className }: { icon: LucideIcon; hue?: Hue; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center animate-rise rounded-card border-2 border-dashed border-primary/20 bg-gradient-to-b from-primary-soft/60 to-surface/40 px-6 py-14 text-center", className)}>
      <IconTile icon={icon} hue={hue} size="lg" />
      <h2 className="mt-4 text-lg font-bold text-ink">{title}</h2>
      {description && <p className="mt-1 max-w-sm text-sm leading-6 text-ink-soft">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

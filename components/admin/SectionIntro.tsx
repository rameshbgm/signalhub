import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { IconTile, type Hue } from "@/components/ui/icon-tile";

/** Heading for a group of cards on a page that has several distinct sections. */
export function SectionIntro({ title, description, icon, hue, actions }: { title: ReactNode; description?: ReactNode; icon?: LucideIcon; hue?: Hue; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <IconTile icon={icon} hue={hue} />}
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
          {description && <p className="mt-0.5 max-w-2xl text-sm leading-6 text-ink-soft">{description}</p>}
        </div>
      </div>
      {actions}
    </div>
  );
}

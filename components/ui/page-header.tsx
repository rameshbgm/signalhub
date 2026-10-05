import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { IconTile, type Hue } from "@/components/ui/icon-tile";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, icon, hue, actions, className }: { title: ReactNode; description?: ReactNode; icon?: LucideIcon; hue?: Hue; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="flex min-w-0 items-start gap-3.5">
        {icon && <IconTile icon={icon} hue={hue} size="lg" />}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-soft">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { IconTile, type Hue } from "@/components/ui/icon-tile";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, icon, hue, actions, className }: { title: ReactNode; description?: ReactNode; icon?: LucideIcon; hue?: Hue; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex animate-rise flex-wrap items-end justify-between gap-5", className)}>
      <div className="flex min-w-0 items-center gap-4">
        {icon && <IconTile icon={icon} hue={hue} size="lg" className="animate-pop" />}
        <div className="min-w-0">
          <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.03em] text-ink sm:text-[2.125rem]">{title}</h1>
          {description && <p className="mt-1.5 max-w-2xl text-[0.9375rem] leading-6 text-ink-soft">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

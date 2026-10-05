import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { IconTile, type Hue } from "@/components/ui/icon-tile";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

const box = "rounded-card border border-line bg-surface p-4 shadow-card";
const linkBox = "block outline-none transition-[border-color,box-shadow,transform] duration-200 ease-soft hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-raised focus-visible:ring-4 focus-visible:ring-primary/25";

/** A count or short value. `warn` and `danger` add a badge so the state never rests on colour alone. */
export function PlatformStat({ label, value, icon, hue = "violet", tone = "normal", href }: {
  label: ReactNode;
  value: string | number;
  icon: LucideIcon;
  hue?: Hue;
  tone?: "normal" | "warn" | "danger";
  href?: string;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <IconTile icon={icon} hue={tone === "warn" ? "amber" : tone === "danger" ? "rose" : hue} size="sm" />
        {tone !== "normal" && <StatusBadge tone={tone}>{tone === "warn" ? "Review" : "Action needed"}</StatusBadge>}
      </div>
      <p className={cn("mt-3 truncate font-semibold tabular-nums tracking-tight text-ink", typeof value === "number" ? "text-2xl" : "text-lg")} title={String(value)}>{value}</p>
      <p className="mt-0.5 text-sm text-ink-soft">{label}</p>
    </>
  );
  return href ? <Link href={href} className={cn(box, linkBox)}>{content}</Link> : <div className={box}>{content}</div>;
}

/** A runtime check: a named subsystem, a status badge, and one line of detail. */
export function PlatformHealth({ label, tone, status, detail, icon }: {
  label: string;
  tone: StatusTone;
  status: string;
  detail?: string;
  icon: LucideIcon;
}) {
  return (
    <div className={box}>
      <div className="flex items-center gap-3">
        <IconTile icon={icon} hue={tone === "danger" ? "rose" : tone === "ok" ? "emerald" : "slate"} size="sm" />
        <p className="min-w-0 truncate text-sm font-medium text-ink">{label}</p>
      </div>
      <div className="mt-3"><StatusBadge tone={tone}>{status}</StatusBadge></div>
      {detail && <p className="mt-2 line-clamp-2 break-words text-xs leading-5 text-ink-dim" title={detail}>{detail}</p>}
    </div>
  );
}

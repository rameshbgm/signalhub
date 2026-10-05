import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "ok" | "warn" | "danger" | "info" | "neutral";

const tones: Record<StatusTone, { pill: string; dot: string }> = {
  ok: { pill: "bg-ok-bg text-ok-fg", dot: "bg-ok" },
  warn: { pill: "bg-warn-bg text-warn-fg", dot: "bg-warn" },
  danger: { pill: "bg-danger-bg text-danger-fg", dot: "bg-danger" },
  info: { pill: "bg-info-bg text-info-fg", dot: "bg-info" },
  neutral: { pill: "bg-sunken text-ink-soft", dot: "bg-ink-dim" },
};

/** Status is always a dot plus a label, never colour alone. `live` adds a soft pulse. */
export function StatusBadge({ tone = "neutral", live = false, className, children, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: StatusTone; live?: boolean }) {
  return (
    <span {...props} className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone].pill, className)}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", tones[tone].dot, live && "animate-pulse-ring text-current")} />
      {children}
    </span>
  );
}

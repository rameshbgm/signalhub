import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} className={cn("inline-flex items-center rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--fg-soft)]", className)} />;
}

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} className={cn("inline-flex items-center gap-1 rounded-chip border border-primary/15 bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-ink", className)} />;
}

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} className={cn("inline-flex items-center gap-1 rounded-full border border-line bg-sunken px-2.5 py-0.5 text-xs font-medium text-ink-soft", className)} />;
}

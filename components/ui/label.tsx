import type { LabelHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label {...props} className={cn("text-[0.8125rem] font-semibold text-ink", className)} />;
}

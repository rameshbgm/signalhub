import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn("relative min-w-0 rounded-card border border-line bg-surface text-ink shadow-card", className)} />;
}

/** `tinted` gives the title section a light brand wash, with padding that tightens on small screens. */
export function CardHeader({ className, tinted = false, ...props }: HTMLAttributes<HTMLDivElement> & { tinted?: boolean }) {
  return <div {...props} className={cn("flex flex-col gap-1 border-b border-line px-5 py-4", tinted && "rounded-t-card bg-primary-soft/50 px-4 py-3 sm:px-5 sm:py-4", className)} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn("p-5", className)} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 {...props} className={cn("text-[0.9375rem] font-semibold tracking-tight text-ink", className)} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p {...props} className={cn("text-sm leading-6 text-ink-soft", className)} />;
}

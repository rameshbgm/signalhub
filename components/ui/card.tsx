import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn("relative rounded-card bg-surface text-ink shadow-card ring-1 ring-line/80 transition-shadow duration-300 ease-soft", className)} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn("flex flex-col gap-1 px-6 pb-4 pt-6", className)} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn("p-6", className)} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 {...props} className={cn("text-lg font-bold tracking-tight text-ink", className)} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p {...props} className={cn("text-sm leading-6 text-ink-soft", className)} />;
}

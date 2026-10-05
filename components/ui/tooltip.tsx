"use client";

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Tooltip({ children, content }: { children: ReactNode; content: { children: ReactNode; className?: string } }) {
  const tooltipId = useId();
  if (!isValidElement(children)) return children;
  return (
    <span className="group/tip relative inline-flex">
      {cloneElement(children as ReactElement<{ "aria-describedby"?: string }>, { "aria-describedby": tooltipId })}
      <span
        id={tooltipId}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-[calc(100%+0.5rem)] left-1/2 z-[2100] w-max max-w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 translate-y-1 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-float transition-[opacity,transform] duration-150 ease-soft group-hover/tip:translate-y-0 group-hover/tip:opacity-100 group-focus-within/tip:translate-y-0 group-focus-within/tip:opacity-100",
          content.className,
        )}
      >
        {content.children}
      </span>
    </span>
  );
}

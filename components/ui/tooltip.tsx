"use client";

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

export function Tooltip({ children, content }: { children: ReactNode; content: { children: ReactNode; className?: string } }) {
  const tooltipId = useId();
  if (!isValidElement(children)) return children;
  return <span className="ui-tooltip-anchor">{cloneElement(children as ReactElement<{ "aria-describedby"?: string }>, { "aria-describedby": tooltipId })}<span id={tooltipId} role="tooltip" className={`ui-tooltip ${content.className ?? ""}`}>{content.children}</span></span>;
}

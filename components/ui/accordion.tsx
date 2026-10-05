"use client";

import { createContext, useContext, useState, type HTMLAttributes, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const AccordionContext = createContext<{ open: string[]; toggle: (value: string) => void }>({ open: [], toggle: () => undefined });
const ItemContext = createContext("");

export function Accordion({ defaultOpenItems = [], children, className }: { defaultOpenItems?: string[]; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(defaultOpenItems);
  const toggle = (value: string) => setOpen((items) => items.includes(value) ? items.filter((item) => item !== value) : [...items, value]);
  return <AccordionContext.Provider value={{ open, toggle }}><div className={className}>{children}</div></AccordionContext.Provider>;
}

export function AccordionItem({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  return <ItemContext.Provider value={value}><div className={className}>{children}</div></ItemContext.Provider>;
}

export function AccordionHeader({ children, className }: { children: ReactNode; className?: string }) {
  const value = useContext(ItemContext); const { open, toggle } = useContext(AccordionContext); const expanded = open.includes(value);
  return <button type="button" aria-expanded={expanded} className={cn("flex min-h-14 w-full items-center justify-between text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)] hover:bg-[var(--hover-overlay)]", className)} onClick={() => toggle(value)}><span className="min-w-0 flex-1">{children}</span><ChevronDown aria-hidden size={18} className={cn("ml-3 shrink-0 text-[var(--cyan)] transition-transform duration-200", expanded && "rotate-180")} /></button>;
}

export function AccordionPanel({ children, className }: HTMLAttributes<HTMLDivElement>) {
  const value = useContext(ItemContext); const { open } = useContext(AccordionContext);
  if (!open.includes(value)) return null;
  return <div className={cn("animate-[ui-reveal_180ms_ease-out]", className)}>{children}</div>;
}

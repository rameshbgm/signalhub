import type { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) { return <div className="relative w-full overflow-auto"><table {...props} className={cn("w-full caption-bottom text-sm", className)} /></div>; }
export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) { return <thead {...props} className={cn("border-b border-[var(--line)]", className)} />; }
export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) { return <tbody {...props} className={cn("[&_tr:last-child]:border-0", className)} />; }
export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) { return <tr {...props} className={cn("border-b border-[var(--line)] transition-colors hover:bg-[var(--hover-overlay)]", className)} />; }
export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) { return <th {...props} className={cn("h-11 px-4 text-left align-middle text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--fg-dim)]", className)} />; }
export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) { return <td {...props} className={cn("p-4 align-middle text-[var(--fg-soft)]", className)} />; }

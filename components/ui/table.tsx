import type { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) { return <div className="relative w-full overflow-auto"><table {...props} className={cn("w-full caption-bottom text-sm", className)} /></div>; }
export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) { return <thead {...props} className={cn("border-b border-line bg-sunken/60", className)} />; }
export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) { return <tbody {...props} className={cn("[&_tr:last-child]:border-0", className)} />; }
export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) { return <tr {...props} className={cn("border-b border-line transition-colors duration-150 hover:bg-primary-soft/50", className)} />; }
export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) { return <th {...props} className={cn("h-11 px-4 text-left align-middle text-xs font-semibold text-ink-soft", className)} />; }
export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) { return <td {...props} className={cn("p-4 align-middle text-ink-soft", className)} />; }

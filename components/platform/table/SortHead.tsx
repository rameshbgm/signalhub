import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SortLink = { href: string; active: boolean; dir: "asc" | "desc" };

/** A column header that sorts when clicked; the current column shows its direction. */
export function SortHead({ label, link, className }: { label: string; link: SortLink; className?: string }) {
  const Icon = !link.active ? ChevronsUpDown : link.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead aria-sort={link.active ? (link.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("whitespace-nowrap", className)}>
      <Link href={link.href} scroll={false} className={cn("-mx-1.5 inline-flex items-center gap-1.5 rounded-chip px-1.5 py-1 outline-none transition-colors hover:bg-line/60 hover:text-ink focus-visible:ring-[3px] focus-visible:ring-primary/30", link.active && "text-ink")}>
        {label}
        <Icon aria-hidden size={13} className={link.active ? "text-primary" : "text-ink-dim"} />
      </Link>
    </TableHead>
  );
}

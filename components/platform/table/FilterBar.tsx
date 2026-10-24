"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type FilterSpec = { name: string; label: string; value: string; options: Array<{ value: string; label: string }> };

/** Search and filters write to the URL (page resets to 1), so the server renders the matching rows. */
export function FilterBar({ q, placeholder, filters }: { q: string; placeholder: string; filters: FilterSpec[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const current = useSearchParams();
  const [text, setText] = useState(q);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [seenQ, setSeenQ] = useState(q);
  if (seenQ !== q) { setSeenQ(q); setText(q); }
  useEffect(() => () => clearTimeout(timer.current), []);

  function update(patch: Record<string, string>) {
    const next = new URLSearchParams(current.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value && value !== "all") next.set(key, value); else next.delete(key);
    }
    next.delete("page");
    const query = next.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  const active = Boolean(q) || filters.some((filter) => filter.value !== "all");
  return (
    <div role="search" className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <div className="relative min-w-52 flex-1 sm:max-w-sm">
        <Search aria-hidden size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim" />
        <Input
          value={text}
          aria-label={placeholder}
          placeholder={placeholder}
          maxLength={100}
          className="pl-9 pr-8"
          onChange={(event) => {
            setText(event.target.value);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => update({ q: event.target.value.trim() }), 300);
          }}
        />
        {pending
          ? <Loader2 aria-hidden size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-ink-dim" />
          : text && <button type="button" aria-label="Clear search" onClick={() => { setText(""); update({ q: "" }); }} className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full text-ink-dim outline-none hover:bg-sunken hover:text-ink focus-visible:ring-[3px] focus-visible:ring-primary/30"><X aria-hidden size={13} /></button>}
      </div>
      {filters.map((filter) => (
        <Select key={filter.name} aria-label={filter.label} value={filter.value} onChange={(event) => update({ [filter.name]: event.target.value })} className="h-9 w-40">
          {filter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
      ))}
      {active && (
        <button type="button" onClick={() => { setText(""); update({ q: "", ...Object.fromEntries(filters.map((filter) => [filter.name, "all"])) }); }}
          className={cn("inline-flex h-9 items-center gap-1.5 rounded-control px-2.5 text-xs font-medium text-ink-soft outline-none transition-colors hover:bg-sunken hover:text-ink focus-visible:ring-[3px] focus-visible:ring-primary/30")}>
          <X aria-hidden size={13} /> Clear
        </button>
      )}
    </div>
  );
}

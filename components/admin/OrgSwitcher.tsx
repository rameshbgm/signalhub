"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

export function OrgSwitcher({
  orgName,
  plan,
  pages,
}: {
  orgName: string;
  plan: string;
  pages: { id: string; name: string; slug: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative px-3 py-3 border-b border-gray-100">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-gray-50 transition-colors"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--ink)] font-mono text-xs font-semibold text-white">
          {orgName.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-semibold">{orgName}</span>
          <span className="block text-[11px] capitalize text-gray-400">{plan} plan</span>
        </span>
        <span className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>

      {open && (
        <div className="absolute left-3 right-3 top-full z-20 mt-1 rounded-lg border border-gray-200 bg-white py-1.5 shadow-lg">
          <p className="px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-gray-400">Your pages</p>
          {pages.map((p) => (
            <Link
              key={p.id}
              href={`/admin/pages/${p.id}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--up)]" />
              {p.name}
            </Link>
          ))}
          {pages.length === 0 && <p className="px-3 py-1.5 text-xs text-gray-400">No pages yet</p>}
          <div className="mt-1 border-t border-gray-100 pt-1">
            <Link href="/admin/pages" onClick={() => setOpen(false)} className="block px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-gray-50">
              Manage all pages →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

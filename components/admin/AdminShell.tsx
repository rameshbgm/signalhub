"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

export function AdminShell({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const designer = /^\/organization\/pages\/[^/]+\/design\/?$/.test(pathname);
  const [navigationPath, setNavigationPath] = useState<string | null>(null);
  const navigationOpen = navigationPath === pathname;

  useEffect(() => {
    if (!navigationOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavigationPath(null);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [navigationOpen]);

  return (
    <div className={`min-h-screen bg-[var(--bg)] text-[var(--fg)] ${designer ? "block" : "lg:flex"}`}>
      {!designer && (
        <>
          <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[var(--line)] bg-[var(--surface)]/95 px-4 backdrop-blur lg:hidden">
            <Link href="/organization" className="font-mono text-sm font-semibold tracking-tight text-[var(--fg)]">
              SignalHub
            </Link>
            <button
              type="button"
              aria-controls="portal-navigation"
              aria-expanded={navigationOpen}
              aria-label={navigationOpen ? "Close navigation" : "Open navigation"}
              className="inline-flex h-10 items-center gap-2 border border-[var(--line)] px-3 font-mono text-xs font-semibold text-[var(--fg)] hover:bg-[var(--hover-overlay)]"
              onClick={() => setNavigationPath((current) => current === pathname ? null : pathname)}
            >
              <span aria-hidden className="text-base leading-none">{navigationOpen ? "×" : "☰"}</span>
              Menu
            </button>
          </header>
          <div
            className={`${navigationOpen ? "fixed" : "hidden"} inset-0 z-50 lg:static lg:inset-auto lg:block lg:shrink-0`}
          >
            <button
              type="button"
              aria-label="Close navigation"
              className="absolute inset-0 bg-black/45 backdrop-blur-[1px] lg:hidden"
              onClick={() => setNavigationPath(null)}
            />
            <div
              id="portal-navigation"
              className="relative h-full w-[min(20rem,calc(100vw-3rem))] bg-[var(--surface)] shadow-2xl lg:contents"
            >
              <div className="flex h-14 items-center justify-between border-b border-[var(--line)] px-4 lg:hidden">
                <span className="font-mono text-sm font-semibold">Navigation</span>
                <button
                  type="button"
                  aria-label="Close navigation"
                  className="flex h-10 w-10 items-center justify-center border border-[var(--line)] text-xl leading-none"
                  onClick={() => setNavigationPath(null)}
                >
                  ×
                </button>
              </div>
              <div className="h-[calc(100%-3.5rem)] overflow-y-auto lg:contents">{sidebar}</div>
            </div>
          </div>
        </>
      )}
      <main className="app-console-main min-w-0 flex-1 overflow-x-clip">
        <div className={designer ? "" : "mx-auto w-full max-w-[96rem] p-4 sm:p-6 [&>*]:mx-auto"}>{children}</div>
      </main>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AdminShell({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const focusedFlow = pathname === "/organization/pages/new" || /^\/organization\/pages\/[^/]+\/setup\//.test(pathname);
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
    <div className={`dispatch-shell min-h-screen bg-[var(--bg)] text-[var(--fg)] ${focusedFlow ? "dispatch-shell--focused" : "lg:flex"}`}>
      {!focusedFlow && (
        <>
          <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[var(--line)] bg-[var(--surface)]/95 px-4 backdrop-blur lg:hidden">
            <Link href="/organization" className="flex items-center gap-2 font-mono text-sm font-semibold tracking-tight text-[var(--fg)]">
              <span className="inline-block h-2 w-2 bg-[var(--cyan)]" aria-hidden /> SignalHub
            </Link>
            <Button
              type="button"
              aria-controls="portal-navigation"
              aria-expanded={navigationOpen}
              aria-label={navigationOpen ? "Close navigation" : "Open navigation"}
              variant="outline"
              className="h-10 rounded-none px-3 font-mono text-xs"
              onClick={() => setNavigationPath((current) => current === pathname ? null : pathname)}
            >
              {navigationOpen ? <X aria-hidden size={17} /> : <Menu aria-hidden size={17} />}
              Menu
            </Button>
          </header>
          <div className={`${navigationOpen ? "fixed" : "hidden"} inset-0 z-50 lg:static lg:inset-auto lg:block lg:shrink-0`}>
            <Button
              type="button"
              aria-label="Close navigation"
              variant="ghost"
              className="absolute inset-0 h-auto w-auto rounded-none bg-black/45 p-0 backdrop-blur-[1px] lg:hidden"
              onClick={() => setNavigationPath(null)}
            />
            <div
              id="portal-navigation"
              className="relative h-full w-[min(22rem,calc(100vw-2rem))] bg-[var(--surface)] shadow-2xl lg:contents"
            >
              <div className="flex h-14 items-center justify-between border-b border-[var(--line)] px-4 lg:hidden">
                <span className="font-mono text-sm font-semibold">Navigation</span>
                <Button
                  type="button"
                  aria-label="Close navigation"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 rounded-none text-xl leading-none"
                  onClick={() => setNavigationPath(null)}
                >
                  <X aria-hidden size={18} />
                </Button>
              </div>
              <div className="h-[calc(100%-3.5rem)] overflow-y-auto lg:contents">{sidebar}</div>
            </div>
          </div>
        </>
      )}
      <main className="app-console-main min-w-0 flex-1 overflow-x-clip">
        {!focusedFlow && <div className="enterprise-topbar"><span className="enterprise-topbar__brand">SignalHub</span><span className="enterprise-topbar__context">Operations workspace</span></div>}
        <div className={focusedFlow ? "" : "mx-auto w-full max-w-[112rem] px-4 py-6 sm:px-8 lg:px-10 lg:py-9 [&>*]:mx-auto"}>{children}</div>
      </main>
    </div>
  );
}

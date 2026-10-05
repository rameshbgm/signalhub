"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle({ className = "" }: { className?: string }) {
  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <Button
      type="button"
      onClick={toggle}
      aria-label="Toggle color theme"
      title="Toggle color theme"
      variant="ghost"
      size="icon"
      className={`h-7 w-7 shrink-0 rounded-none border border-[var(--line)] text-[var(--fg-soft)] transition-colors hover:border-[var(--line-bright)] hover:text-[var(--fg)] ${className}`}
    >
      <Sun aria-hidden size={14} className="hidden dark:block" />
      <Moon aria-hidden size={14} className="dark:hidden" />
    </Button>
  );
}

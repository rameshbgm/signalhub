"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { motion } from "motion/react";
import { Check, ChevronDown } from "lucide-react";
import { formatWindow, MAX_WINDOW_MINUTES, MIN_WINDOW_MINUTES, QUICK_WINDOWS } from "@/lib/metric-ranges";
import type { MetricRange } from "@/lib/page-design";
import { RANGE_LABELS } from "@/components/public/metric/shared";

const UNITS = [
  { label: "min", minutes: 1 },
  { label: "hours", minutes: 60 },
  { label: "days", minutes: 1_440 },
] as const;

const radius = "var(--page-radius, 8px)";
const tint = (color: string, percent: number) => `color-mix(in srgb, ${color} ${percent}%, transparent)`;

/**
 * Segmented range control for a public metric chart: the fixed ranges plus a "More" menu with quick windows
 * (1 minute to 12 hours) and a custom value. Styled with the page's theme variables like the other public controls.
 */
export function RangeControl({ id, name, color, ranges, activeRange, activeMinutes, loading, animate, onRange, onWindow }: {
  id: string;
  name: string;
  color: string;
  ranges: readonly MetricRange[];
  activeRange: MetricRange | null;
  activeMinutes: number | null;
  loading: boolean;
  animate: boolean;
  onRange: (range: MetricRange) => void;
  onWindow: (minutes: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("90");
  const [unit, setUnit] = useState<(typeof UNITS)[number]["minutes"]>(1);
  const [error, setError] = useState<string | null>(null);
  useToast("danger", error);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>("[role=menuitemradio]")?.focus());
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  function pick(minutes: number) {
    setError(null);
    setOpen(false);
    onWindow(minutes);
  }

  function applyCustom() {
    const minutes = Math.round(Number(amount) * unit);
    if (!Number.isFinite(minutes) || minutes < MIN_WINDOW_MINUTES) return setError("Enter at least 1 minute.");
    if (minutes > MAX_WINDOW_MINUTES) return setError("The longest window is 90 days.");
    pick(minutes);
  }

  const segment = "relative px-2.5 py-1 text-xs font-medium tabular-nums transition-colors outline-none focus-visible:ring-2";
  const activeStyle = { color, background: tint(color, 14) };

  return (
    <div ref={rootRef} className="relative">
      <div className="inline-flex items-center gap-0.5 border border-[var(--line)] bg-[var(--surface)] p-0.5" style={{ borderRadius: radius }}>
        <div role="radiogroup" aria-label={`${name} time range`} className="flex gap-0.5">
          {ranges.map((range) => {
            const active = activeRange === range;
            return (
              <button
                key={range}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onRange(range)}
                className={`${segment} ${active ? "" : "text-[var(--fg-dim)] hover:text-[var(--fg)]"}`}
                style={{ borderRadius: `calc(${radius} - 2px)`, color: active ? color : undefined }}
              >
                {active && <motion.span layoutId={`metric-range-${id}`} className="absolute inset-0" style={{ background: tint(color, 14), borderRadius: `calc(${radius} - 2px)` }} transition={animate ? { type: "spring", stiffness: 500, damping: 36 } : { duration: 0 }} />}
                <span className="relative">{RANGE_LABELS[range]}</span>
              </button>
            );
          })}
        </div>
        <span aria-hidden className="mx-0.5 h-4 w-px bg-[var(--line)]" />
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-busy={loading}
          onClick={() => setOpen((current) => !current)}
          className={`${segment} inline-flex items-center gap-1 ${activeMinutes === null ? "text-[var(--fg-dim)] hover:text-[var(--fg)]" : ""}`}
          style={{ borderRadius: `calc(${radius} - 2px)`, ...(activeMinutes !== null ? activeStyle : {}) }}
        >
          {activeMinutes === null ? "More" : formatWindow(activeMinutes)}
          <ChevronDown aria-hidden size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <motion.div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={`${name} time window`}
          initial={animate ? { opacity: 0, y: -4, scale: 0.98 } : false}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: animate ? 0.15 : 0 }}
          className="absolute right-0 top-full z-30 mt-1.5 w-60 border border-[var(--line-bright)] bg-[var(--surface)] p-1.5 text-[var(--fg)] shadow-xl"
          style={{ borderRadius: `calc(${radius} + 4px)` }}
        >
          <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-dim)]">Last</p>
          <div className="grid grid-cols-2 gap-0.5">
            {QUICK_WINDOWS.map((window) => {
              const active = activeMinutes === window.minutes;
              return (
                <button
                  key={window.minutes}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => pick(window.minutes)}
                  className="flex items-center justify-between px-2 py-1.5 text-left text-xs outline-none transition-colors hover:bg-[var(--bg)] focus-visible:bg-[var(--bg)]"
                  style={{ borderRadius: `calc(${radius} - 2px)`, ...(active ? activeStyle : {}) }}
                >
                  {window.label}
                  {active && <Check aria-hidden size={12} />}
                </button>
              );
            })}
          </div>

          <div className="my-1.5 h-px bg-[var(--line)]" />
          <form onSubmit={(event) => { event.preventDefault(); applyCustom(); }} className="space-y-2 px-1 pb-1">
            <label htmlFor={`${menuId}-amount`} className="block px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-dim)]">Custom</label>
            <div className="flex items-center gap-1.5">
              <input
                id={`${menuId}-amount`}
                type="number"
                min={1}
                step="any"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="h-8 w-16 border border-[var(--line)] bg-[var(--bg)] px-2 text-xs text-[var(--fg)] outline-none focus:border-[var(--fg-dim)]"
                style={{ borderRadius: `calc(${radius} - 2px)` }}
              />
              <div role="radiogroup" aria-label="Unit" className="flex flex-1 border border-[var(--line)] p-0.5" style={{ borderRadius: `calc(${radius} - 2px)` }}>
                {UNITS.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    role="radio"
                    aria-checked={unit === option.minutes}
                    onClick={() => setUnit(option.minutes)}
                    className="flex-1 py-1 text-[11px] transition-colors"
                    style={{ borderRadius: `calc(${radius} - 4px)`, ...(unit === option.minutes ? activeStyle : { color: "var(--fg-dim)" }) }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <button type="submit" className="h-8 w-full text-xs font-medium text-white transition-opacity hover:opacity-90" style={{ background: color, borderRadius: `calc(${radius} - 2px)` }}>
              Show this window
            </button>
          </form>
        </motion.div>
      )}
    </div>
  );
}

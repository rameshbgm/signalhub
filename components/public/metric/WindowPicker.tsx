"use client";

import { useId, useState } from "react";
import { formatWindow, MAX_WINDOW_MINUTES, MIN_WINDOW_MINUTES, QUICK_WINDOWS } from "@/lib/metric-ranges";

const UNITS = [
  { label: "minutes", minutes: 1 },
  { label: "hours", minutes: 60 },
  { label: "days", minutes: 1_440 },
] as const;

const controlClass = "border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--fg)] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1";

/**
 * Dropdown of quick windows (1 minute to 12 hours) plus a custom value. `active` is the selected window in
 * minutes, or null while one of the fixed ranges is selected.
 */
export function WindowPicker({ name, color, active, loading, onSelect }: {
  name: string;
  color: string;
  active: number | null;
  loading: boolean;
  onSelect: (minutes: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("90");
  const [unit, setUnit] = useState<(typeof UNITS)[number]["minutes"]>(1);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const isQuick = active !== null && QUICK_WINDOWS.some((window) => window.minutes === active);
  const selectValue = active === null ? "" : isQuick ? String(active) : "custom";

  function apply() {
    const minutes = Math.round(Number(amount) * unit);
    if (!Number.isFinite(minutes) || minutes < MIN_WINDOW_MINUTES) return setError("Enter a value of at least 1 minute.");
    if (minutes > MAX_WINDOW_MINUTES) return setError("The longest window is 90 days.");
    setError(null);
    setEditing(false);
    onSelect(minutes);
  }

  return (
    <div className="relative">
      <select
        aria-label={`${name} quick or custom time window`}
        aria-busy={loading}
        value={selectValue}
        onChange={(event) => {
          const value = event.target.value;
          if (value === "custom") { setEditing(true); return; }
          if (value === "") return;
          setEditing(false);
          setError(null);
          onSelect(Number(value));
        }}
        className={`${controlClass} cursor-pointer`}
        style={active !== null ? { color, borderColor: color } : { color: "var(--fg-dim)" }}
      >
        <option value="" disabled>Quick range</option>
        {QUICK_WINDOWS.map((window) => <option key={window.minutes} value={window.minutes}>{window.label}</option>)}
        <option value="custom">{active !== null && !isQuick ? `Custom: ${formatWindow(active)}` : "Custom…"}</option>
      </select>
      {editing && (
        <form
          onSubmit={(event) => { event.preventDefault(); apply(); }}
          className="absolute right-0 top-full z-20 mt-1 w-64 space-y-2 border border-[var(--line-bright)] bg-[var(--surface-raised)] p-3 shadow-lg"
        >
          <label htmlFor={`${id}-amount`} className="block text-xs text-[var(--fg-soft)]">Show the last</label>
          <div className="flex gap-2">
            <input
              id={`${id}-amount`}
              type="number"
              min={1}
              step="any"
              inputMode="decimal"
              autoFocus
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className={`${controlClass} w-20`}
            />
            <select aria-label="Unit" value={unit} onChange={(event) => setUnit(Number(event.target.value) as typeof unit)} className={`${controlClass} flex-1`}>
              {UNITS.map((option) => <option key={option.label} value={option.minutes}>{option.label}</option>)}
            </select>
          </div>
          {error && <p role="alert" className="text-xs text-[#dc2626]">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setEditing(false); setError(null); }} className="px-2 py-1 text-xs text-[var(--fg-dim)] hover:text-[var(--fg)]">Cancel</button>
            <button type="submit" className="px-3 py-1 text-xs font-medium text-white" style={{ background: color }}>Apply</button>
          </div>
        </form>
      )}
    </div>
  );
}

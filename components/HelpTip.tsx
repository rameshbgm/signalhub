export function HelpTip({ text, align = "left" }: { text: string; align?: "left" | "right" }) {
  return (
    <span className="help-tip">
      <button
        type="button"
        data-button-guard="off"
        tabIndex={0}
        aria-label={text}
        className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[var(--fg-dim)] text-[9px] font-bold leading-none text-[var(--fg-dim)] transition-colors hover:border-[var(--cyan)] hover:text-[var(--cyan)]"
      >
        ?
      </button>
      <span
        role="tooltip"
        className={`help-bubble pointer-events-none absolute top-full z-30 mt-1.5 w-56 rounded-none border border-[var(--line-bright)] bg-[var(--surface-raised)] px-2.5 py-2 text-[11px] leading-snug text-[var(--fg-soft)] shadow-lg ${
          align === "right" ? "right-0" : "left-0"
        }`}
      >
        {text}
      </span>
    </span>
  );
}

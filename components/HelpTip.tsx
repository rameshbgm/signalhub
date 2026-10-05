import { CircleHelp } from "lucide-react";

export function HelpTip({ text, align = "left" }: { text: string; align?: "left" | "right" }) {
  return (
    <span className="help-tip">
      <button
        type="button"
        data-button-guard="off"
        aria-label={text}
        className="inline-grid size-6 place-items-center rounded-full text-ink-dim outline-none transition-colors duration-200 hover:text-primary focus-visible:ring-4 focus-visible:ring-primary/25"
      >
        <CircleHelp aria-hidden size={16} />
      </button>
      <span
        role="tooltip"
        className={`help-bubble pointer-events-none absolute top-full z-30 mt-1.5 w-56 rounded-control bg-ink px-3 py-2 text-xs font-medium leading-5 text-white shadow-float ${
          align === "right" ? "right-0" : "left-0"
        }`}
      >
        {text}
      </span>
    </span>
  );
}

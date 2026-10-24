import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type SetupStep = { label: string; state: "done" | "current" | "todo" };

/** A numbered progress trail for the focused create flow and the draft overview. */
export function SetupSteps({ steps, label = "Setup progress", className }: { steps: SetupStep[]; label?: string; className?: string }) {
  return (
    <ol aria-label={label} className={cn("flex items-center gap-2 text-sm", className)}>
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        return (
          <li key={step.label} aria-current={step.state === "current" ? "step" : undefined} className={cn("flex min-w-0 items-center gap-2", !last && "flex-1")}>
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors duration-200",
                step.state === "done" && "bg-ok-bg text-ok-fg",
                step.state === "current" && "bg-primary text-on-primary shadow-primary",
                step.state === "todo" && "border border-line-strong bg-surface text-ink-dim",
              )}
            >
              {step.state === "done" ? <Check aria-hidden size={14} /> : index + 1}
            </span>
            <span className={cn("truncate font-medium", step.state === "current" ? "text-ink" : "text-ink-dim", step.state !== "current" && "max-sm:sr-only")}>
              {step.label}
              {step.state === "done" && <span className="sr-only"> (done)</span>}
            </span>
            {!last && <span aria-hidden="true" className={cn("h-px min-w-4 flex-1", step.state === "done" ? "bg-ok/50" : "bg-line-strong")} />}
          </li>
        );
      })}
    </ol>
  );
}

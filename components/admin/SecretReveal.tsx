import { CopyButton } from "@/components/CopyButton";
import { cn } from "@/lib/utils";

/** A tokens/secrets/URL value in a mono, click-to-select field with a copy button. */
export function SecretField({ value, copyValue, copyLabel, label, className }: { value: string; copyValue?: string; copyLabel: string; label?: string; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <p className="text-xs font-medium text-ink-soft">{label}</p>}
      <div className="flex flex-wrap items-start gap-2">
        <code className="min-w-0 flex-1 basis-56 select-all break-all rounded-control border border-line-strong bg-surface px-3 py-2 font-mono text-xs leading-5 text-ink">{value}</code>
        <CopyButton value={copyValue ?? value} label={copyLabel} errorClassName="basis-full text-xs text-danger-fg" />
      </div>
    </div>
  );
}

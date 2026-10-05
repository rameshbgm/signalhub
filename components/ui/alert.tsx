import type { HTMLAttributes, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const tones = {
  ok: { box: "border-ok/25 bg-ok-bg text-ok-fg", Icon: CheckCircle2 },
  warn: { box: "border-warn/40 bg-warn-bg text-warn-fg", Icon: AlertTriangle },
  danger: { box: "border-danger/25 bg-danger-bg text-danger-fg", Icon: XCircle },
  info: { box: "border-info/25 bg-info-bg text-info-fg", Icon: Info },
} as const;

export function Alert({ tone = "info", title, children, className, ...props }: Omit<HTMLAttributes<HTMLDivElement>, "title"> & { tone?: keyof typeof tones; title?: ReactNode }) {
  const { box, Icon } = tones[tone];
  return (
    <div role={tone === "danger" || tone === "warn" ? "alert" : "status"} {...props} className={cn("flex animate-rise items-start gap-3 rounded-control border-l-4 px-4 py-3.5 shadow-card text-sm", box, className)}>
      <Icon aria-hidden size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0 leading-6">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}

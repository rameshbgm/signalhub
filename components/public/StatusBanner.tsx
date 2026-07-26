import { formatPageDate } from "@/lib/page-locale";

export function StatusBanner({
  label,
  color,
  updatedAt,
  locale = "en",
  timeZone = "UTC",
  variant = "PANEL",
  showLastUpdated = true,
  description,
}: {
  label: string;
  color: string;
  updatedAt?: Date | null;
  locale?: string;
  timeZone?: string;
  variant?: "PANEL" | "SOLID" | "CENTERED" | "COMPACT";
  showLastUpdated?: boolean;
  description?: string | null;
}) {
  const operational = label === "All Systems Operational";
  const solid = variant === "SOLID";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`page-panel border flex items-center gap-4 ${
        variant === "COMPACT" ? "px-4 py-3" : "px-5 py-5 sm:px-6 sm:py-6"
      } ${variant === "CENTERED" ? "justify-center text-center" : ""}`}
      style={{
        borderColor: color,
        color: solid ? "#ffffff" : color,
        backgroundColor: solid ? color : "var(--surface)",
      }}
    >
      <BannerIcon color={solid ? "#ffffff" : color} operational={operational} />
      <div className="min-w-0">
        <p className="font-mono text-lg font-semibold sm:text-xl">{label}</p>
        {description && <p className={`mt-1 text-sm ${solid ? "text-white/85" : "text-[var(--fg-soft)]"}`}>{description}</p>}
        {showLastUpdated && updatedAt && (
          <p className={`mt-1 text-xs font-normal ${solid ? "text-white/75" : "text-[var(--fg-dim)]"}`}>
            Last activity{" "}
            {formatPageDate(updatedAt, {
              language: locale,
              timeZone,
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        )}
      </div>
    </div>
  );
}

function BannerIcon({ color, operational }: { color: string; operational: boolean }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <circle cx="12" cy="12" r="11" stroke={color} strokeOpacity="0.4" strokeWidth="1.5" />
      {operational ? (
        <path d="M7 12.5l3 3 7-7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M12 7v6m0 4h.01" stroke={color} strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  );
}

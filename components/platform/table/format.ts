// Fixed locale and zone: the same text on the server and in the browser (no hydration mismatch), and audit-friendly.
const DATE = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
const TIME = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "UTC" });

export const formatDate = (iso: string) => DATE.format(new Date(iso));
export const formatTime = (iso: string) => `${TIME.format(new Date(iso))} UTC`;
export const formatDateTime = (iso: string) => `${formatDate(iso)}, ${formatTime(iso)}`;

export function ago(iso: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

export const words = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());

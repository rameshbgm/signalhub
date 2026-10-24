// Client-safe: imported by the public chart components, so no database access here.

/** Visitor-selectable windows. Bucket widths give roughly 90-100 points per chart. */
export const SERIES_RANGES: Record<"24h" | "7d" | "30d" | "90d", RangeSpec> = {
  "24h": { windowMs: 86_400_000, bucketSec: 900, cellSec: 3_600 },
  "7d": { windowMs: 7 * 86_400_000, bucketSec: 7_200, cellSec: 86_400 },
  "30d": { windowMs: 30 * 86_400_000, bucketSec: 28_800, cellSec: 86_400 },
  "90d": { windowMs: 90 * 86_400_000, bucketSec: 86_400, cellSec: 86_400 },
};
export type SeriesRangeId = keyof typeof SERIES_RANGES;
export const SERIES_RANGE_IDS = Object.keys(SERIES_RANGES) as SeriesRangeId[];

export type RangeSpec = { windowMs: number; bucketSec: number; cellSec: number };

/** Shortest and longest window a visitor may ask for, in minutes (90 days matches the longest preset range). */
export const MIN_WINDOW_MINUTES = 1;
export const MAX_WINDOW_MINUTES = 90 * 24 * 60;

/** Quick windows offered in the range dropdown. */
export const QUICK_WINDOWS: readonly { minutes: number; label: string }[] = [
  { minutes: 1, label: "1 min" },
  { minutes: 5, label: "5 min" },
  { minutes: 15, label: "15 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 45, label: "45 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
  { minutes: 180, label: "3 hours" },
  { minutes: 360, label: "6 hours" },
  { minutes: 720, label: "12 hours" },
];

const CELL_STEPS_SEC = [60, 300, 900, 1_800, 3_600, 7_200, 21_600, 43_200, 86_400];

/** Bucket and calendar-cell sizes for an arbitrary window: about 90 chart points and at most 48 cells. */
export function specForWindow(minutes: number): RangeSpec {
  const windowSec = minutes * 60;
  return {
    windowMs: windowSec * 1000,
    bucketSec: Math.max(1, Math.ceil(windowSec / 90)),
    cellSec: CELL_STEPS_SEC.find((step) => windowSec / step <= 48) ?? 86_400,
  };
}

/** "90 min" -> "1 h 30 min", "2880" -> "2 days". */
export function formatWindow(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1_440) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  const days = Math.floor(minutes / 1_440);
  const rest = minutes % 1_440;
  if (!rest) return `${days} ${days === 1 ? "day" : "days"}`;
  return `${days} d ${Math.floor(rest / 60)} h${rest % 60 ? ` ${rest % 60} min` : ""}`;
}

// Client-safe: imported by the public chart components, so no database access here.

/** Visitor-selectable windows. Bucket widths give roughly 90-100 points per chart. */
export const SERIES_RANGES = {
  "24h": { windowMs: 86_400_000, bucketSec: 900, cellSec: 3_600 },
  "7d": { windowMs: 7 * 86_400_000, bucketSec: 7_200, cellSec: 86_400 },
  "30d": { windowMs: 30 * 86_400_000, bucketSec: 28_800, cellSec: 86_400 },
  "90d": { windowMs: 90 * 86_400_000, bucketSec: 86_400, cellSec: 86_400 },
} as const;
export type SeriesRangeId = keyof typeof SERIES_RANGES;
export const SERIES_RANGE_IDS = Object.keys(SERIES_RANGES) as SeriesRangeId[];

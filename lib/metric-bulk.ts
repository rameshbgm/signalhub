// Bulk metric action rules shared by the metrics list UI and bulkMetricAction, so both enforce the same limits.

export const BULK_METRIC_INTENTS = ["show", "hide", "delete"] as const;
export type BulkMetricIntent = (typeof BULK_METRIC_INTENTS)[number];
export const BULK_METRIC_LIMIT = 100;

export const metricCountLabel = (count: number) => `${count} metric${count === 1 ? "" : "s"}`;
export const bulkMetricDeletePhrase = (count: number) => `delete ${metricCountLabel(count)}`;
export const matchesBulkMetricDeletePhrase = (input: string, count: number) => input.trim().toLowerCase() === bulkMetricDeletePhrase(count);

export function isBulkMetricIntent(value: unknown): value is BulkMetricIntent {
  return typeof value === "string" && (BULK_METRIC_INTENTS as readonly string[]).includes(value);
}

// Bulk monitor action rules shared by the monitors list UI and bulkMonitorAction, so both enforce the same limits.

export const BULK_MONITOR_INTENTS = ["run", "pause", "resume", "delete"] as const;
export type BulkMonitorIntent = (typeof BULK_MONITOR_INTENTS)[number];
export const BULK_MONITOR_LIMIT = 100;

export const monitorCountLabel = (count: number) => `${count} monitor${count === 1 ? "" : "s"}`;
export const bulkMonitorDeletePhrase = (count: number) => `delete ${monitorCountLabel(count)}`;
export const matchesBulkMonitorDeletePhrase = (input: string, count: number) => input.trim().toLowerCase() === bulkMonitorDeletePhrase(count);

export function isBulkMonitorIntent(value: unknown): value is BulkMonitorIntent {
  return typeof value === "string" && (BULK_MONITOR_INTENTS as readonly string[]).includes(value);
}

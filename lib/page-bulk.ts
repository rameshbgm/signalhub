// Bulk page action rules shared by the pages list UI and bulkPageAction, so both enforce the same limits.

export const BULK_PAGE_INTENTS = ["publish", "hide", "remove", "delete"] as const;
export type BulkPageIntent = (typeof BULK_PAGE_INTENTS)[number];
export const BULK_PAGE_LIMIT = 100;

export const pageCountLabel = (count: number) => `${count} page${count === 1 ? "" : "s"}`;
export const bulkDeletePhrase = (count: number) => `delete ${pageCountLabel(count)}`;
export const matchesBulkDeletePhrase = (input: string, count: number) => input.trim().toLowerCase() === bulkDeletePhrase(count);

export function isBulkPageIntent(value: unknown): value is BulkPageIntent {
  return typeof value === "string" && (BULK_PAGE_INTENTS as readonly string[]).includes(value);
}

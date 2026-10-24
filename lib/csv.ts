/** Neutralizes values a spreadsheet would otherwise evaluate as a formula. */
export function spreadsheetSafe(value: unknown) {
  const text = typeof value === "string" ? value : value instanceof Date ? value.toISOString() : typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "");
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/** Quotes one CSV field after spreadsheet-formula neutralization. */
export function csvField(value: unknown) {
  return `"${spreadsheetSafe(value).replace(/"/g, '""')}"`;
}

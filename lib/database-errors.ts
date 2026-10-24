// Maps Postgres input-validation failures to safe client messages, so a malformed id or oversized
// value that slips past app checks becomes a 400 instead of a logged 500 with a generic message.
const INPUT_ERRORS: Record<string, string> = {
  "22P02": "A value in the request is malformed. Reload and try again.",
  "22001": "A value in the request is too long.",
  "22003": "A number in the request is out of range.",
  "22007": "A date in the request is invalid.",
  "22008": "A date in the request is out of range.",
  "23502": "A required value is missing.",
  "23503": "A referenced item no longer exists. Reload and try again.",
  "23514": "A value in the request is not allowed.",
};

export function databaseInputErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error) || typeof error.code !== "string") return null;
  return INPUT_ERRORS[error.code] ?? null;
}

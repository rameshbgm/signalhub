/** Generic failure categories. Raw error text is never exposed publicly: it can contain internal hostnames and IPs. */
export type FailureKind = "timeout" | "dns" | "tls" | "refused" | "other";

const FAILURE_PATTERNS: [FailureKind, RegExp][] = [
  ["timeout", /time(d)?\s?out|timeout|aborted/i],
  ["dns", /ENOTFOUND|EAI_AGAIN|getaddrinfo|dns|no (a|aaaa|cname|mx|ns|txt) records/i],
  ["tls", /certificate|\btls\b|\bssl\b|CERT_|DEPTH_ZERO|handshake/i],
  ["refused", /ECONNREFUSED|ECONNRESET|connection (refused|reset)|socket hang up|EHOSTUNREACH|ENETUNREACH/i],
];

/** Maps a failed check's error text to a public-safe category. */
export function classifyFailure(error: string | null): FailureKind {
  if (!error) return "other";
  return FAILURE_PATTERNS.find(([, pattern]) => pattern.test(error))?.[0] ?? "other";
}

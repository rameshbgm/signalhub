/** Rejects javascript:/data: and other non-http(s)/mailto schemes to prevent stored XSS via user-supplied link fields. */
export function safeUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, "https://x.invalid");
    return parsed.protocol === "https:" || parsed.protocol === "http:" || parsed.protocol === "mailto:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * Returns the externally reachable application URL used in generated
 * invitations. Production must configure it explicitly so operators never
 * hand customers a localhost link.
 */
export function publicAppUrl(
  environment: {
    NEXT_PUBLIC_APP_URL?: string;
    NODE_ENV?: string;
  } = process.env
) {
  const configured = environment.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured && environment.NODE_ENV === "production") {
    throw new Error(
      "NEXT_PUBLIC_APP_URL must be configured before creating invitations"
    );
  }
  const value = configured || "http://localhost:3301";
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL must be a valid absolute URL");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL must be a plain HTTP(S) base URL without credentials, a query, or a fragment"
    );
  }
  return parsed.toString().replace(/\/+$/, "");
}

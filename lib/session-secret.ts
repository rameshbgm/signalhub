// Single source of truth for the JWT signing key. Throws instead of falling
// back to a hardcoded secret: a missing/weak SESSION_SECRET in production means
// anyone could forge admin session tokens, so we refuse to start rather than
// sign with a guessable key.
let cached: Uint8Array | null = null;

export function getSessionSecret(): Uint8Array {
  if (cached) return cached;

  const secret = process.env.SESSION_SECRET;
  const isProd = process.env.NODE_ENV === "production";

  if (!secret || secret.length < 32 || secret === "dev-secret-change-me") {
    if (isProd) {
      throw new Error(
        "SESSION_SECRET must be set to a strong value (>=32 chars) in production. " +
          "Generate one with: openssl rand -base64 48"
      );
    }
    // Non-production only: allow a fixed dev key so local runs work, but keep it
    // obviously non-secret and 32+ chars so the same validation path applies.
    cached = new TextEncoder().encode("dev-only-insecure-secret-do-not-use-in-prod");
    return cached;
  }

  cached = new TextEncoder().encode(secret);
  return cached;
}

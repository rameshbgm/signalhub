// Single source of truth for the JWT signing key. Throws instead of falling
// back to a hardcoded secret: a missing/weak SESSION_SECRET in production means
// anyone could forge admin session tokens, so we refuse to start rather than
// sign with a guessable key.
let cached: Uint8Array | null = null;

export type SigningKey = { id: string; secret: Uint8Array };

function validatedSecret(value: string | undefined, name: string) {
  const isProd = process.env.NODE_ENV === "production";
  if (!value || value.length < 32 || value === "dev-secret-change-me") {
    if (isProd) {
      throw new Error(
        `${name} must contain a strong value (>=32 chars) in production. ` +
          "Generate one with: openssl rand -base64 48"
      );
    }
    return new TextEncoder().encode("dev-only-insecure-secret-do-not-use-in-prod");
  }
  return new TextEncoder().encode(value);
}

export function getSessionSecret(): Uint8Array {
  if (cached) return cached;

  cached = validatedSecret(process.env.SESSION_SECRET, "SESSION_SECRET");
  return cached;
}

/**
 * SESSION_SIGNING_KEYS is a JSON object of key-id to secret. The active key is
 * selected with SESSION_ACTIVE_KEY_ID. SESSION_SECRET remains a backwards
 * compatible singleton key and is always accepted during a rotation.
 */
export function getSessionSigningKeys(): { active: SigningKey; all: SigningKey[] } {
  const fallback = { id: "legacy", secret: getSessionSecret() };
  const configured = process.env.SESSION_SIGNING_KEYS;
  if (!configured) return { active: fallback, all: [fallback] };

  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(configured) as Record<string, string>;
  } catch {
    throw new Error("SESSION_SIGNING_KEYS must be a JSON object");
  }
  const keys = Object.entries(parsed).map(([id, value]) => ({
    id,
    secret: validatedSecret(value, `SESSION_SIGNING_KEYS.${id}`),
  }));
  if (!keys.length) throw new Error("SESSION_SIGNING_KEYS must contain at least one key");
  const activeId = process.env.SESSION_ACTIVE_KEY_ID ?? keys[0].id;
  const active = keys.find((key) => key.id === activeId);
  if (!active) throw new Error("SESSION_ACTIVE_KEY_ID does not exist in SESSION_SIGNING_KEYS");
  return {
    active,
    all: keys.some((key) => key.id === fallback.id) ? keys : [...keys, fallback],
  };
}

import { createHash } from "node:crypto";
import { z } from "zod";
import { decryptSecret, encryptSecret } from "@/lib/encryption";
import { guardedFetch, type ProxyConfig } from "@/lib/guarded-fetch";
import { INPUT_LIMITS } from "@/lib/input-limits";
import { limitedResponseText } from "@/lib/limited-response";
import { validateHttpTarget } from "@/lib/target-validation";

/**
 * OAuth2 client credentials and mTLS need several fields, so they live in one
 * encrypted JSON blob (monitors.auth_config_ciphertext) instead of loose columns.
 * Secrets are never sent to the browser; a blank secret on edit keeps the stored one.
 */
const oauthInput = z.object({
  kind: z.literal("OAUTH2"),
  tokenUrl: z.string().trim().min(1).max(INPUT_LIMITS.url),
  clientId: z.string().trim().min(1, "OAuth2 client ID is required").max(INPUT_LIMITS.monitorAuthUsername),
  clientSecret: z.string().max(INPUT_LIMITS.monitorAuthSecret),
  scope: z.string().trim().max(INPUT_LIMITS.monitorOAuthScope),
  audience: z.string().trim().max(INPUT_LIMITS.monitorOAuthScope),
  credentialsIn: z.enum(["body", "basic"]),
});

const mtlsInput = z.object({
  kind: z.literal("MTLS"),
  cert: z.string().trim().max(INPUT_LIMITS.monitorPem),
  key: z.string().trim().max(INPUT_LIMITS.monitorPem),
  passphrase: z.string().max(INPUT_LIMITS.monitorAuthSecret),
  ca: z.string().trim().max(INPUT_LIMITS.monitorPem),
});

export const authConfigInputSchema = z.discriminatedUnion("kind", [oauthInput, mtlsInput]);
export type AuthConfigInput = z.infer<typeof authConfigInputSchema>;
export type OAuthConfig = z.infer<typeof oauthInput>;

/** Everything the edit form may see: no secret values, only whether one is stored. */
export type AuthConfigView = {
  tokenUrl: string; clientId: string; scope: string; audience: string; credentialsIn: "body" | "basic";
  hasClientSecret: boolean;
  cert: string; ca: string; hasKey: boolean; hasPassphrase: boolean;
};

export function readAuthConfig(ciphertext: string): AuthConfigInput {
  return authConfigInputSchema.parse(JSON.parse(decryptSecret(ciphertext)));
}

export function authConfigView(ciphertext: string | null): AuthConfigView {
  let config: AuthConfigInput | null = null;
  // An unreadable blob (rotated-out key) shows as empty so the monitor can still be re-saved.
  try { config = ciphertext ? readAuthConfig(ciphertext) : null; } catch { config = null; }
  const oauth = config?.kind === "OAUTH2" ? config : null;
  const mtls = config?.kind === "MTLS" ? config : null;
  return {
    tokenUrl: oauth?.tokenUrl ?? "", clientId: oauth?.clientId ?? "", scope: oauth?.scope ?? "", audience: oauth?.audience ?? "",
    credentialsIn: oauth?.credentialsIn ?? "body", hasClientSecret: Boolean(oauth?.clientSecret),
    cert: mtls?.cert ?? "", ca: mtls?.ca ?? "", hasKey: Boolean(mtls?.key), hasPassphrase: Boolean(mtls?.passphrase),
  };
}

function assertPem(value: string, label: string) {
  if (!/-----BEGIN [A-Z ]+-----[\s\S]+-----END [A-Z ]+-----/.test(value)) throw new Error(`${label} must be PEM encoded`);
}

/**
 * Validates the submitted config, fills blank secrets from the stored one, and
 * returns the ciphertext to store (null when the auth type needs no config).
 */
export function resolveAuthConfig(authType: string, input: AuthConfigInput | null | undefined, existingCiphertext: string | null): string | null {
  if (authType !== "OAUTH2" && authType !== "MTLS") return null;
  if (!input || input.kind !== authType) throw new Error(`${authType === "MTLS" ? "mTLS" : "OAuth2"} settings are required`);
  const stored = existingCiphertext ? readAuthConfig(existingCiphertext) : null;
  if (input.kind === "OAUTH2") {
    const previous = stored?.kind === "OAUTH2" ? stored : null;
    const merged = { ...input, clientSecret: input.clientSecret || previous?.clientSecret || "" };
    if (!merged.clientSecret) throw new Error("OAuth2 client secret is required");
    let tokenUrl: URL;
    try { tokenUrl = new URL(merged.tokenUrl); } catch { throw new Error("OAuth2 token URL must be a valid URL"); }
    if (tokenUrl.protocol !== "https:" && tokenUrl.protocol !== "http:") throw new Error("OAuth2 token URL must use HTTP or HTTPS");
    if (tokenUrl.username || tokenUrl.password) throw new Error("Credentials are not allowed in the token URL");
    return encryptSecret(JSON.stringify(merged));
  }
  const previous = stored?.kind === "MTLS" ? stored : null;
  const key = input.key || previous?.key || "";
  // A new key brings its own passphrase; keeping the old key keeps the old passphrase unless one is typed.
  const passphrase = input.key ? input.passphrase : input.passphrase || previous?.passphrase || "";
  if (!input.cert) throw new Error("mTLS client certificate is required");
  if (!key) throw new Error("mTLS private key is required");
  assertPem(input.cert, "mTLS client certificate");
  assertPem(key, "mTLS private key");
  if (input.ca) assertPem(input.ca, "mTLS CA certificate");
  return encryptSecret(JSON.stringify({ ...input, key, passphrase }));
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const TOKEN_EXPIRY_MARGIN_S = 30;
const DEFAULT_TOKEN_LIFETIME_S = 300;

/**
 * Client-credentials access token, cached in memory until shortly before it expires.
 * ponytail: per-process cache with no refresh-token flow; add one only if a provider rate-limits token requests.
 */
export async function oauthAccessToken(monitorId: string, config: OAuthConfig, options: { allowPrivate: boolean; timeoutMs: number; proxy?: ProxyConfig | null }) {
  const cacheKey = `${monitorId}:${createHash("sha256").update(JSON.stringify(config)).digest("hex")}`;
  const hit = tokenCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.token;

  const url = await validateHttpTarget(config.tokenUrl, { allowPrivate: options.allowPrivate });
  const form = new URLSearchParams({ grant_type: "client_credentials" });
  if (config.scope) form.set("scope", config.scope);
  if (config.audience) form.set("audience", config.audience);
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
  if (config.credentialsIn === "basic") {
    // RFC 6749 section 2.3.1: the id and secret are form-encoded before Basic encoding.
    headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret)}`).toString("base64")}`;
  } else {
    form.set("client_id", config.clientId);
    form.set("client_secret", config.clientSecret);
  }
  const response = await guardedFetch(url, {
    method: "POST", headers, body: form.toString(),
    signal: AbortSignal.timeout(Math.min(options.timeoutMs, 10_000)), allowPrivate: options.allowPrivate, proxy: options.proxy,
  });
  const text = await limitedResponseText(response);
  if (!response.ok) throw new Error(`OAuth2 token request failed with HTTP ${response.status}`);
  let parsed: { access_token?: unknown; expires_in?: unknown };
  try { parsed = JSON.parse(text); } catch { throw new Error("OAuth2 token response was not JSON"); }
  if (typeof parsed.access_token !== "string" || !parsed.access_token) throw new Error("OAuth2 token response had no access_token");
  const lifetime = Number(parsed.expires_in) > 0 ? Number(parsed.expires_in) : DEFAULT_TOKEN_LIFETIME_S;
  if (tokenCache.size > 500) for (const [key, entry] of tokenCache) if (entry.expiresAt <= Date.now()) tokenCache.delete(key);
  tokenCache.set(cacheKey, { token: parsed.access_token, expiresAt: Date.now() + Math.max(0, lifetime - TOKEN_EXPIRY_MARGIN_S) * 1000 });
  return parsed.access_token;
}

/** Test hook: drop cached tokens. */
export function clearOAuthTokenCache() {
  tokenCache.clear();
}

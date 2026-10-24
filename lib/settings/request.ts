import { effectiveProxyTrust, peerIsTrusted, peerStamped, PEER_HEADER, type ProxyTrustSettings } from "@/lib/proxy-trust";
import { effectiveSetting, type StoredSettings, storedSettings } from "@/lib/settings/effective";

/**
 * Pure helpers that turn the saved settings and one request into decisions:
 * which public address to link to, whether the request is HTTPS, whether the
 * sign-in cookie is Secure, and whether to send HSTS. They never throw.
 */
type Env = Record<string, string | undefined>;

/** The base address for links we generate: environment, then the admin's value, then the fallback (often the request origin). */
export function appBaseUrl(fallbackOrigin?: string, env: Env = process.env, stored: StoredSettings = storedSettings()) {
  const configured = effectiveSetting("publicUrl", env, stored).value;
  return (configured ?? fallbackOrigin ?? "").replace(/\/+$/, "");
}

/**
 * Whether this request reached the proxy over HTTPS. The server itself only speaks
 * plain HTTP, so HTTPS is known only from a trusted proxy's X-Forwarded-Proto.
 * Null when the connection address cannot be seen at all.
 */
export function requestScheme(
  headers: Headers,
  peerVisible = peerStamped(),
  trust: ProxyTrustSettings = effectiveProxyTrust(),
): "https" | "http" | null {
  if (!peerVisible) return null;
  const peer = headers.get(PEER_HEADER)?.trim() || null;
  const forwarded = headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return peerIsTrusted(peer, trust) && forwarded === "https" ? "https" : "http";
}

export function secureCookieDecision(input: {
  mode: "auto" | "always";
  publicUrl: string | null;
  scheme: "https" | "http" | null;
  production: boolean;
}) {
  if (input.mode === "always") return true;
  if (input.publicUrl) return input.publicUrl.startsWith("https:");
  if (input.scheme) return input.scheme === "https";
  return input.production;
}

const HSTS_SIX_MONTHS = "max-age=15552000";

/** Never over plain HTTP (browsers ignore it there, and it must not outlive a working HTTPS setup). */
export function hstsValue(input: { mode: "auto" | "on" | "off"; publicUrl: string | null; scheme: "https" | "http" | null }) {
  if (input.mode === "off" || input.scheme !== "https") return null;
  if (input.mode === "on") return HSTS_SIX_MONTHS;
  return input.publicUrl?.startsWith("https:") ? HSTS_SIX_MONTHS : null;
}

export function secureCookiesFor(headers: Headers | null, env: Env = process.env, stored: StoredSettings = storedSettings()) {
  return secureCookieDecision({
    mode: effectiveSetting("secureCookies", env, stored).value,
    publicUrl: effectiveSetting("publicUrl", env, stored).value,
    scheme: headers ? requestScheme(headers) : null,
    production: env.NODE_ENV === "production",
  });
}

export function hstsFor(headers: Headers, env: Env = process.env, stored: StoredSettings = storedSettings()) {
  return hstsValue({
    mode: effectiveSetting("hsts", env, stored).value,
    publicUrl: effectiveSetting("publicUrl", env, stored).value,
    scheme: requestScheme(headers),
  });
}

import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import { getSessionSecret } from "@/lib/session-secret";

export const OIDC_TRANSACTION_COOKIE = "status_oidc_transaction";

type OidcDiscovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
};

export type OidcConnectionConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  scopes?: string[];
};

const discoveryCache = new Map<string, OidcDiscovery>();

function environmentConfig(): OidcConnectionConfig {
  if (!process.env.OIDC_ISSUER || !process.env.OIDC_CLIENT_ID || !process.env.OIDC_CLIENT_SECRET) {
    throw new Error("OIDC is not configured");
  }
  return {
    issuer: process.env.OIDC_ISSUER,
    clientId: process.env.OIDC_CLIENT_ID,
    clientSecret: process.env.OIDC_CLIENT_SECRET,
  };
}

export function oidcConfigured() {
  return Boolean(
    process.env.OIDC_ISSUER &&
      process.env.OIDC_CLIENT_ID &&
      process.env.OIDC_CLIENT_SECRET
  );
}

export function oidcRedirectUri(origin: string, connectionSlug?: string) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, "");
  return connectionSlug
    ? `${base}/api/auth/oidc/${encodeURIComponent(connectionSlug)}/callback`
    : `${base}/api/auth/oidc/callback`;
}

export async function getOidcDiscovery(config = environmentConfig()): Promise<OidcDiscovery> {
  const issuer = config.issuer.replace(/\/$/, "");
  const cached = discoveryCache.get(issuer);
  if (cached) return cached;
  const response = await fetch(`${issuer}/.well-known/openid-configuration`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`OIDC discovery failed with HTTP ${response.status}`);
  const value = (await response.json()) as Partial<OidcDiscovery>;
  if (
    value.issuer !== issuer ||
    !value.authorization_endpoint ||
    !value.token_endpoint ||
    !value.jwks_uri
  ) {
    throw new Error("OIDC discovery document is incomplete or has an unexpected issuer");
  }
  discoveryCache.set(issuer, value as OidcDiscovery);
  return value as OidcDiscovery;
}

export function createOidcTransactionValues() {
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { state, nonce, verifier, challenge };
}

export async function signOidcTransaction(input: {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  connectionSlug?: string;
}) {
  return new SignJWT(input)
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("oidc-transaction")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getSessionSecret());
}

export async function verifyOidcTransaction(token: string) {
  const { payload } = await jwtVerify(token, getSessionSecret(), { audience: "oidc-transaction" });
  if (
    typeof payload.state !== "string" ||
    typeof payload.nonce !== "string" ||
    typeof payload.verifier !== "string" ||
    typeof payload.returnTo !== "string" ||
    (payload.connectionSlug !== undefined && typeof payload.connectionSlug !== "string")
  ) {
    throw new Error("Invalid OIDC transaction");
  }
  return {
    state: payload.state,
    nonce: payload.nonce,
    verifier: payload.verifier,
    returnTo: payload.returnTo,
    connectionSlug: payload.connectionSlug,
  };
}

export async function exchangeAndVerifyOidcCode(input: {
  code: string;
  verifier: string;
  nonce: string;
  redirectUri: string;
  config?: OidcConnectionConfig;
}) {
  const config = input.config ?? environmentConfig();
  const discovery = await getOidcDiscovery(config);
  const clientId = config.clientId;
  const response = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: clientId,
      client_secret: config.clientSecret,
      code_verifier: input.verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`OIDC token exchange failed with HTTP ${response.status}`);
  const tokens = (await response.json()) as { id_token?: string };
  if (!tokens.id_token) throw new Error("OIDC provider did not return an ID token");

  const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
  const { payload } = await jwtVerify(tokens.id_token, jwks, {
    issuer: discovery.issuer,
    audience: clientId,
  });
  if (payload.nonce !== input.nonce) throw new Error("OIDC nonce validation failed");
  if (
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    payload.email_verified !== true
  ) {
    throw new Error("OIDC requires a verified email claim");
  }
  return {
    issuer: discovery.issuer,
    subject: payload.sub,
    email: payload.email,
    name: typeof payload.name === "string" ? payload.name : payload.email,
    groups: Array.isArray(payload.groups)
      ? payload.groups.filter((group): group is string => typeof group === "string")
      : [],
    acr: typeof payload.acr === "string" ? payload.acr : null,
    amr: Array.isArray(payload.amr)
      ? payload.amr.filter((method): method is string => typeof method === "string")
      : [],
  };
}

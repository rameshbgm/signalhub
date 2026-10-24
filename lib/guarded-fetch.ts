import http from "node:http";
import https from "node:https";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { lookup as dnsLookupAll } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";
import type { TLSSocket } from "node:tls";
import { isPrivateAddress } from "@/lib/target-validation";
import { authority, proxyAuthorization, proxyHopAgent, tunnelAgent, type Pin, type ProxyConfig } from "@/lib/proxy-tunnel";

export type { ProxyConfig };

export class BlockedAddressError extends Error {}

export type GuardedFetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string | null;
  signal?: AbortSignal;
  /** Permit loopback, link-local, and RFC 1918 destinations. */
  allowPrivate?: boolean;
  /** Restrict DNS resolution to IPv4 (4) or IPv6 (6); unset lets Node pick (Happy Eyeballs). */
  family?: 4 | 6;
  /** `false` accepts invalid, expired, and self-signed certificates (HTTPS only). */
  rejectUnauthorized?: boolean;
  /** Client certificate for mutual TLS, and an optional CA bundle to trust (PEM). */
  clientCertificate?: { cert: string; key: string; passphrase?: string; ca?: string };
  /** Reach the destination through this proxy. The proxy only sees an address that already passed the private-network check. */
  proxy?: ProxyConfig | null;
  /** Called with the server certificate's expiry once an HTTPS response arrives. */
  onPeerCertificate?: (expiresAt: Date) => void;
};

/**
 * Resolves the hostname and rejects private destinations at connect time, so
 * the address that is checked is the address that is used (no DNS rebinding).
 */
export function guardedLookup(allowPrivate: boolean): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, options, (error, address, family) => {
      if (error) return callback(error, address as never, family);
      const addresses: LookupAddress[] = Array.isArray(address) ? address : [{ address, family: family ?? 4 }];
      if (!allowPrivate && addresses.some((entry) => isPrivateAddress(entry.address))) {
        return callback(new BlockedAddressError(`${hostname} resolves to a private or local network address`), address as never, family);
      }
      callback(null, address as never, family);
    });
  };
}

/**
 * Resolves a name to the one address a proxied request will use. Direct requests
 * check at connect time instead; a proxy would resolve the name itself, so the
 * check happens here and the proxy is only given the checked address.
 */
export async function pinnedAddress(hostname: string, allowPrivate: boolean, family?: 4 | 6) {
  const literal = hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(literal)
    ? [{ address: literal, family: isIP(literal) }]
    : await dnsLookupAll(literal, { all: true, family: family ?? 0 });
  if (!addresses.length) throw new Error(`${hostname} did not resolve`);
  if (!allowPrivate && addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new BlockedAddressError(`${hostname} resolves to a private or local network address`);
  }
  return (addresses.find((entry) => entry.family === 4) ?? addresses[0]).address;
}

/**
 * Minimal fetch for operator-configured URLs (monitors, webhooks, chat
 * destinations). It never follows redirects; callers treat 3xx as a result.
 */
export async function guardedFetch(input: string | URL, init: GuardedFetchInit = {}): Promise<Response> {
  const url = new URL(input);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS destinations are supported");
  }
  if (url.username || url.password) throw new Error("Credentials are not allowed in target URLs");
  const allowPrivate = init.allowPrivate ?? false;
  const literal = url.hostname.replace(/^\[|\]$/g, "");
  // Node skips `lookup` for IP literals, so check them here.
  if (!allowPrivate && isIP(literal) && isPrivateAddress(literal)) {
    throw new BlockedAddressError("Private or local network destinations are not allowed");
  }
  const method = (init.method ?? "GET").toUpperCase();
  const body = init.body == null ? undefined : Buffer.from(init.body);
  const headers: Record<string, string> = { "accept-encoding": "identity", ...init.headers };
  if (body) headers["content-length"] = String(body.byteLength);
  const transport = url.protocol === "https:" ? https : http;

  // Direct: the DNS lookup itself rejects private addresses. Proxied: see pinnedAddress.
  let route: http.RequestOptions = { lookup: guardedLookup(allowPrivate), agent: false, family: init.family };
  const proxy = init.proxy;
  if (proxy) {
    const pin: Pin = (hostname) => pinnedAddress(hostname, allowPrivate);
    const address = await pinnedAddress(url.hostname, allowPrivate, init.family);
    const port = Number(url.port) || (url.protocol === "https:" ? 443 : 80);
    const socks = proxy.protocol === "SOCKS4" || proxy.protocol === "SOCKS5";
    if (url.protocol === "http:" && !socks) {
      // Plain HTTP through an HTTP(S) proxy: absolute-form request to the pinned address, original Host header.
      route = { agent: proxyHopAgent(proxy, pin, init.signal), path: `http://${authority(address, port)}${url.pathname}${url.search}` };
      const auth = proxyAuthorization(proxy);
      if (auth) headers["proxy-authorization"] = auth;
    } else {
      route = { agent: tunnelAgent({ proxy, pin, target: { address, port }, tlsTarget: url.protocol === "https:", signal: init.signal }) };
    }
  }

  return new Promise((resolve, reject) => {
    const request = transport.request(url, {
      method,
      headers,
      ...route,
      signal: init.signal,
      rejectUnauthorized: init.rejectUnauthorized,
      ...init.clientCertificate && {
        cert: init.clientCertificate.cert,
        key: init.clientCertificate.key,
        passphrase: init.clientCertificate.passphrase || undefined,
        ca: init.clientCertificate.ca || undefined,
      },
    }, (response) => {
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        if (value === undefined) continue;
        for (const item of Array.isArray(value) ? value : [value]) responseHeaders.append(name, item);
      }
      if (init.onPeerCertificate && url.protocol === "https:") {
        const validTo = Date.parse((response.socket as TLSSocket).getPeerCertificate?.()?.valid_to ?? "");
        if (Number.isFinite(validTo)) init.onPeerCertificate(new Date(validTo));
      }
      const status = response.statusCode ?? 502;
      const nullBody = method === "HEAD" || [204, 205, 304].includes(status);
      if (nullBody) response.resume();
      resolve(new Response(nullBody ? null : (Readable.toWeb(response) as ReadableStream<Uint8Array>), {
        status,
        statusText: response.statusMessage,
        headers: responseHeaders,
      }));
    });
    request.on("error", reject);
    request.end(body);
  });
}

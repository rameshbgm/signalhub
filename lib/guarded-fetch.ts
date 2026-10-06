import http from "node:http";
import https from "node:https";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";
import { isPrivateAddress } from "@/lib/target-validation";

export class BlockedAddressError extends Error {}

export type GuardedFetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string | null;
  signal?: AbortSignal;
  /** Permit loopback, link-local, and RFC 1918 destinations. */
  allowPrivate?: boolean;
};

/**
 * Resolves the hostname and rejects private destinations at connect time, so
 * the address that is checked is the address that is used (no DNS rebinding).
 */
function guardedLookup(allowPrivate: boolean): LookupFunction {
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
 * Minimal fetch for operator-configured URLs (monitors, webhooks, chat
 * destinations). It never follows redirects; callers treat 3xx as a result.
 */
export function guardedFetch(input: string | URL, init: GuardedFetchInit = {}): Promise<Response> {
  const url = new URL(input);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return Promise.reject(new Error("Only HTTP and HTTPS destinations are supported"));
  }
  const allowPrivate = init.allowPrivate ?? false;
  const literal = url.hostname.replace(/^\[|\]$/g, "");
  // Node skips `lookup` for IP literals, so check them here.
  if (!allowPrivate && isIP(literal) && isPrivateAddress(literal)) {
    return Promise.reject(new BlockedAddressError("Private or local network destinations are not allowed"));
  }
  const method = (init.method ?? "GET").toUpperCase();
  const body = init.body == null ? undefined : Buffer.from(init.body);
  const headers: Record<string, string> = { "accept-encoding": "identity", ...init.headers };
  if (body) headers["content-length"] = String(body.byteLength);
  const transport = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const request = transport.request(url, {
      method,
      headers,
      lookup: guardedLookup(allowPrivate),
      signal: init.signal,
      agent: false,
    }, (response) => {
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        if (value === undefined) continue;
        for (const item of Array.isArray(value) ? value : [value]) responseHeaders.append(name, item);
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

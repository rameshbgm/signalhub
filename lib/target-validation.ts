import { isIP } from "node:net";
import { resolve4, resolve6 } from "node:dns/promises";

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    parts[0] >= 224
  );
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return isPrivateIpv4(mappedIpv4);
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}

export function isPrivateAddress(address: string) {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return false;
}

export async function assertPublicHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local")) {
    throw new Error("Private or local network targets are not allowed");
  }
  if (isIP(normalized)) {
    if (isPrivateAddress(normalized)) throw new Error("Private or local network targets are not allowed");
    return;
  }
  const addresses = [
    ...(await resolve4(normalized).catch(() => [])),
    ...(await resolve6(normalized).catch(() => [])),
  ];
  if (!addresses.length) throw new Error("Target hostname could not be resolved");
  if (addresses.some(isPrivateAddress)) {
    throw new Error("Target resolves to a private or local network address");
  }
}

export async function validateHttpTarget(
  target: string,
  options: { httpsOnly?: boolean; allowPrivate?: boolean } = {}
) {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw new Error("Target must be a valid URL");
  }
  const allowedProtocols = options.httpsOnly ? ["https:"] : ["http:", "https:"];
  if (!allowedProtocols.includes(url.protocol)) {
    throw new Error(options.httpsOnly ? "Target must use HTTPS" : "Target must use HTTP or HTTPS");
  }
  if (url.username || url.password) throw new Error("Credentials are not allowed in target URLs");
  if (!options.allowPrivate) await assertPublicHostname(url.hostname);
  return url;
}

export async function validateNetworkHost(host: string, allowPrivate = false) {
  const normalized = host.trim().replace(/^\[|\]$/g, "");
  if (!normalized || /[/?#@]/.test(normalized)) throw new Error("Target host is invalid");
  if (!allowPrivate) await assertPublicHostname(normalized);
  return normalized;
}

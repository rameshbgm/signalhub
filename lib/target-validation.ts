import { BlockList, isIP } from "node:net";
import { resolve4, resolve6 } from "node:dns/promises";

// BlockList compares parsed addresses, so every textual IPv6 spelling matches,
// and IPv4-mapped IPv6 (::ffff:7f00:1) is checked against the IPv4 rules.
const privateRanges = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3],
] as const) privateRanges.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 96], // unspecified, loopback and IPv4-compatible
  ["64:ff9b:1::", 48], // local-use NAT64
  ["100::", 64], // discard
  ["2002::", 16], // 6to4 embeds any IPv4 address
  ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) privateRanges.addSubnet(network, prefix, "ipv6");

/** The IPv4 address behind the NAT64 well-known prefix 64:ff9b::/96, if any. */
function nat64Ipv4(address: string) {
  const canonical = new URL(`http://[${address}]`).hostname.slice(1, -1);
  const match = canonical.match(/^64:ff9b::(?:([0-9a-f]{1,4}):)?([0-9a-f]{1,4})?$/);
  if (!match) return null;
  const value = parseInt(match[1] ?? "0", 16) * 65_536 + parseInt(match[2] ?? "0", 16);
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
}

export function isPrivateAddress(address: string) {
  const version = isIP(address);
  if (!version) return false;
  try {
    if (version === 4) return privateRanges.check(address, "ipv4");
    const embedded = nat64Ipv4(address);
    return embedded ? privateRanges.check(embedded, "ipv4") : privateRanges.check(address, "ipv6");
  } catch {
    return true; // Unparseable (e.g. a zone id): treat as private.
  }
}

async function assertPublicHostname(hostname: string) {
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
  // A leading "-" would reach command-line tools such as ping as an option.
  if (!normalized || normalized.startsWith("-") || /[/?#@\s]/.test(normalized)) throw new Error("Target host is invalid");
  if (!allowPrivate) await assertPublicHostname(normalized);
  return normalized;
}

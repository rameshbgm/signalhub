import { addressInRanges, effectiveProxyTrust, parseCidrs, resolveClientIp } from "@/lib/proxy-trust";

export function ipv4InCidr(ip: string, cidr: string) {
  const ipv4Number = (value: string) => {
    const parts = value.split(".").map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
    return parts.reduce((result, part) => (result * 256 + part) >>> 0, 0);
  };
  const [network, prefixValue] = cidr.split("/");
  if (!prefixValue) return ip === network;
  const ipValue = ipv4Number(ip);
  const networkValue = ipv4Number(network);
  const prefix = Number(prefixValue);
  if (ipValue === null || networkValue === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipValue & mask) === (networkValue & mask);
}

/** Empty list = no restriction. Entries that are not valid ranges match nothing, so a typo narrows access instead of lifting it. */
export function addressAllowed(ip: string, cidrs: readonly string[]) {
  return cidrs.length === 0 || addressInRanges(ip, parseCidrs(cidrs).cidrs);
}

export { PEER_HEADER } from "@/lib/proxy-trust";

/** The caller's address, honouring the installation's proxy-trust setting (lib/proxy-trust.ts). */
export function trustedClientIp(headers: Headers) {
  const { mode, hops } = effectiveProxyTrust();
  return resolveClientIp(headers, { mode, hops });
}

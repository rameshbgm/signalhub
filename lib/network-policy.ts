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

export function addressAllowed(ip: string, cidrs: string[]) {
  return cidrs.length === 0 || cidrs.some((cidr) => ipv4InCidr(ip, cidr));
}

export function trustedClientIp(headers: Headers) {
  if (process.env.TRUST_PROXY_HEADERS !== "true") return "unknown";
  const trustedHops = Math.max(1, Math.min(10, Number(process.env.TRUSTED_PROXY_HOPS ?? 1)));
  const forwarded = headers.get("x-forwarded-for")?.split(",").map((item) => item.trim()).filter(Boolean);
  return (forwarded?.length ? forwarded[Math.max(0, forwarded.length - trustedHops)] : null) ??
    headers.get("x-real-ip")?.trim() ??
    "unknown";
}

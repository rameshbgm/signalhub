import { BlockList, isIP } from "node:net";
import type { ProxyTrustMode } from "@/lib/postgres/schema";

/**
 * Whether to believe X-Forwarded-For when working out who is calling.
 *
 *  - auto (default): believe it only when the TCP connection comes from a
 *    loopback or private address, which is where a reverse proxy normally sits.
 *    A client on the public internet cannot choose its own identity.
 *  - on: always believe it. For proxies that connect from a public address.
 *  - off: never believe it; use the connection address.
 *
 * A list of trusted ranges narrows this: when set, Auto and On believe the
 * header only from connections inside the list (for example your proxy's
 * network, or a CDN's published ranges).
 *
 * Kept free of database imports: setup mode and the proxy run without one.
 * The saved admin setting lives in lib/proxy-trust-store.ts.
 */
export type { ProxyTrustMode };
export type ProxyTrustSettings = { mode: ProxyTrustMode; hops: number; cidrs?: readonly string[] };
export type ProxyTrustSource = "environment" | "admin";

export const PEER_HEADER = "x-signalhub-peer";
export const PROXY_TRUST_MODES: readonly ProxyTrustMode[] = ["auto", "on", "off"];
export const MAX_PROXY_HOPS = 10;
const DEFAULT_SETTINGS: ProxyTrustSettings = { mode: "auto", hops: 1, cidrs: [] };

// globalThis: Next may bundle instrumentation and route handlers separately.
const STORE = Symbol.for("signalhub.proxyTrust");
const store = globalThis as unknown as Record<symbol, ProxyTrustSettings | undefined>;

/** The admin-saved setting as last loaded from the database (or the default). */
export function storedProxyTrust(): ProxyTrustSettings {
  return store[STORE] ?? DEFAULT_SETTINGS;
}

export function setStoredProxyTrust(settings: ProxyTrustSettings) {
  store[STORE] = { mode: settings.mode, hops: settings.hops, cidrs: [...(settings.cidrs ?? [])] };
}

const MAX_CIDR_ENTRIES = 64;

/** "10.0.0.0/8, fd00::/8", one per line or comma separated; a bare address means /32 or /128. */
export function parseCidrs(input: string | readonly string[]): { cidrs: string[]; invalid: string[] } {
  const entries = (typeof input === "string" ? input.split(/[\s,]+/) : [...input]).map((item) => item.trim()).filter(Boolean);
  const cidrs: string[] = [];
  const invalid: string[] = [];
  for (const entry of entries) {
    const [address, prefixText, ...extra] = entry.split("/");
    const family = isIP(address);
    const max = family === 4 ? 32 : 128;
    const prefix = prefixText === undefined ? max : /^\d+$/.test(prefixText) ? Number(prefixText) : Number.NaN;
    if (!family || extra.length || !(prefix >= 0 && prefix <= max)) invalid.push(entry);
    else if (!cidrs.includes(`${address}/${prefix}`)) cidrs.push(`${address}/${prefix}`);
  }
  if (cidrs.length > MAX_CIDR_ENTRIES) return { cidrs: cidrs.slice(0, MAX_CIDR_ENTRIES), invalid: [...invalid, `more than ${MAX_CIDR_ENTRIES} entries`] };
  return { cidrs, invalid };
}

/**
 * TRUST_PROXY_HEADERS (true|false|auto), TRUSTED_PROXY_HOPS (1-10), TRUSTED_PROXY_CIDRS.
 * Blank or invalid means "not set"; an invalid CIDR list is ignored whole (and reported) rather than half applied.
 */
export function envProxyTrust(env: Record<string, string | undefined> = process.env): {
  mode?: ProxyTrustMode; hops?: number; cidrs?: string[]; cidrsInvalid?: string[];
} {
  const raw = env.TRUST_PROXY_HEADERS?.trim().toLowerCase();
  const mode: ProxyTrustMode | undefined = raw === "true" ? "on" : raw === "false" ? "off" : raw === "auto" ? "auto" : undefined;
  const hops = /^\d+$/.test(env.TRUSTED_PROXY_HOPS?.trim() ?? "") ? Number(env.TRUSTED_PROXY_HOPS) : undefined;
  const listed = parseCidrs(env.TRUSTED_PROXY_CIDRS ?? "");
  return {
    mode,
    hops: hops && hops >= 1 && hops <= MAX_PROXY_HOPS ? hops : undefined,
    cidrs: listed.invalid.length || !listed.cidrs.length ? undefined : listed.cidrs,
    cidrsInvalid: listed.invalid.length ? listed.invalid : undefined,
  };
}

/** What is in force: the environment wins, the admin setting fills the rest. */
export function effectiveProxyTrust(env: Record<string, string | undefined> = process.env, stored = storedProxyTrust()) {
  const fromEnv = envProxyTrust(env);
  return {
    mode: fromEnv.mode ?? stored.mode,
    hops: fromEnv.hops ?? stored.hops,
    cidrs: fromEnv.cidrs ?? stored.cidrs ?? [],
    modeSource: (fromEnv.mode ? "environment" : "admin") as ProxyTrustSource,
    hopsSource: (fromEnv.hops ? "environment" : "admin") as ProxyTrustSource,
    cidrsSource: (fromEnv.cidrs ? "environment" : "admin") as ProxyTrustSource,
    cidrsInvalid: fromEnv.cidrsInvalid ?? [],
  };
}

export type PeerKind = "loopback" | "private" | "public" | "unknown";

// What a reverse proxy, ingress or PaaS edge connects from. Deliberately not the
// SSRF blocklist: 6to4, NAT64 and benchmarking ranges are public clients here.
const loopbackRanges = new BlockList();
loopbackRanges.addSubnet("127.0.0.0", 8, "ipv4");
loopbackRanges.addAddress("::1", "ipv6");
const proxyPeerRanges = new BlockList();
for (const [network, prefix] of [
  ["10.0.0.0", 8], ["172.16.0.0", 12], ["192.168.0.0", 16], // RFC 1918
  ["100.64.0.0", 10], // carrier-grade NAT: Railway, Azure Container Apps, Tailscale
  ["169.254.0.0", 16], // link-local: Cloud Run
] as const) proxyPeerRanges.addSubnet(network, prefix, "ipv4");
proxyPeerRanges.addSubnet("fc00::", 7, "ipv6"); // unique local: Fly.io, many CNIs
proxyPeerRanges.addSubnet("fe80::", 10, "ipv6");

export function peerKind(address: string | null | undefined): PeerKind {
  const family = address ? isIP(address) : 0;
  if (!address || !family) return "unknown";
  const name = family === 4 ? "ipv4" : "ipv6";
  if (loopbackRanges.check(address, name)) return "loopback";
  return proxyPeerRanges.check(address, name) ? "private" : "public";
}

const rangeMatchers = new Map<string, BlockList>();

/** True when the address is inside any of the CIDRs. Matchers are cached per list. */
export function addressInRanges(address: string, cidrs: readonly string[]) {
  const family = isIP(address);
  if (!family) return false;
  const key = cidrs.join(",");
  let matcher = rangeMatchers.get(key);
  if (!matcher) {
    matcher = new BlockList();
    for (const cidr of cidrs) {
      const [network, prefix] = cidr.split("/");
      try {
        matcher.addSubnet(network, Number(prefix), isIP(network) === 4 ? "ipv4" : "ipv6");
      } catch {
        // Skip a malformed entry: the list only ever adds trusted peers, so this narrows trust.
      }
    }
    if (rangeMatchers.size > 50) rangeMatchers.clear();
    rangeMatchers.set(key, matcher);
  }
  return matcher.check(address, family === 4 ? "ipv4" : "ipv6");
}

/** Whether a connection from this peer may tell us the visitor's address. */
export function peerIsTrusted(peer: string | null, settings: ProxyTrustSettings) {
  if (settings.mode === "off" || !peer) return false;
  const cidrs = settings.cidrs ?? [];
  if (cidrs.length) return addressInRanges(peer, cidrs);
  if (settings.mode === "on") return true;
  const kind = peerKind(peer);
  return kind === "loopback" || kind === "private";
}

/** True once scripts/peer-address.mjs ran in this process, so PEER_HEADER cannot be client-supplied. */
export function peerStamped() {
  return (globalThis as Record<symbol, unknown>)[Symbol.for("signalhub.peerHeader")] === true;
}

/** "::ffff:10.0.0.2" is the same client as "10.0.0.2": keep one spelling so limits and logs agree. */
function plainAddress(address: string) {
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  return mapped ?? address;
}

function forwardedList(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",").map((item) => plainAddress(item.trim())).filter(Boolean) ?? [];
}

function peerOf(headers: Headers, peerTrusted: boolean) {
  const peer = peerTrusted ? headers.get(PEER_HEADER)?.trim() : null;
  return peer ? plainAddress(peer) : null;
}

export function resolveClientIp(headers: Headers, settings: ProxyTrustSettings, peerTrusted = peerStamped()) {
  const peer = peerOf(headers, peerTrusted);
  // "On" without a range list believes the header even when the peer is not visible.
  const believeHeader = peer ? peerIsTrusted(peer, settings) : settings.mode === "on" && !(settings.cidrs ?? []).length;
  if (!believeHeader) return peer ?? "unknown";
  const forwarded = forwardedList(headers);
  // Each proxy appends the address it saw, so only the right-hand entries are trustworthy.
  return (forwarded.length ? forwarded[Math.max(0, forwarded.length - settings.hops)] : null) ??
    (headers.get("x-real-ip")?.trim() ? plainAddress(headers.get("x-real-ip")!.trim()) : null) ??
    peer ??
    "unknown";
}

/** Headers that only well-known proxies and CDNs add. Names are for display. */
const PROXY_HINTS: [header: string, name: string][] = [
  ["cf-ray", "Cloudflare"],
  ["x-amzn-trace-id", "AWS load balancer"],
  ["x-amz-cf-id", "AWS CloudFront"],
  ["fly-request-id", "Fly.io"],
  ["x-render-origin-server", "Render"],
  ["x-azure-ref", "Azure Front Door"],
  ["x-cloud-trace-context", "Google Cloud load balancer"],
  ["x-envoy-external-address", "Envoy / Istio"],
  ["via", "a proxy (Via header)"],
  ["forwarded", "a proxy (Forwarded header)"],
];

export type ProxyDiagnosis = {
  /** The address the TCP connection came from, or null when the server cannot see it. */
  peer: string | null;
  peerKind: PeerKind;
  forwardedFor: string[];
  hints: string[];
  protocol: string | null;
  behindProxy: "yes" | "no" | "unknown";
  recommendedMode: ProxyTrustMode;
  suggestedHops: number;
  /** The address this very request would be recorded under for each mode. */
  clientIpByMode: Record<ProxyTrustMode, string>;
  /** A forwarded address arrived that is not just the connection itself (a proxy forwarded it, or a client sent it). */
  proxyHeaderPresent: boolean;
  /** Whether the current mode and ranges believe this connection; null when the peer is not visible. */
  peerTrusted: boolean | null;
  /** A range covering this proxy's network, offered as a stricter alternative to "any private address". */
  suggestedCidr: string | null;
  reasons: string[];
};

function ipv6Groups(address: string) {
  const [head, tail] = address.split("::");
  const front = head ? head.split(":") : [];
  const back = tail ? tail.split(":") : [];
  const groups = [...front, ...Array(Math.max(0, 8 - front.length - back.length)).fill("0"), ...back];
  return groups.map((group) => Number.parseInt(group, 16).toString(16));
}

/** /16 around a private IPv4 proxy, /64 around an IPv6 one. Loopback and public peers need no range. */
function suggestCidr(peer: string | null) {
  if (!peer || peerKind(peer) !== "private") return null;
  if (isIP(peer) === 4) return `${peer.split(".").slice(0, 2).join(".")}.0.0/16`;
  return `${ipv6Groups(peer).slice(0, 4).join(":")}::/64`;
}

/** Reads the current request and works out whether a proxy sits in front, and what to choose. */
export function diagnoseProxy(headers: Headers, current: ProxyTrustSettings, peerTrusted = peerStamped()): ProxyDiagnosis {
  const peer = peerOf(headers, peerTrusted);
  const kind = peerKind(peer);
  const forwardedFor = forwardedList(headers);
  const hints = PROXY_HINTS.filter(([header]) => headers.has(header)).map(([, name]) => name);
  // On a direct connection Next fills X-Forwarded-For with the peer itself.
  const proxyForwarded = forwardedFor.length > 0 && !(forwardedFor.length === 1 && forwardedFor[0] === peer);
  const privatePeer = kind === "private" || kind === "loopback";

  let behindProxy: ProxyDiagnosis["behindProxy"] = "unknown";
  let recommendedMode: ProxyTrustMode = "auto";
  const reasons: string[] = [];
  if (!peer) {
    reasons.push("This server cannot see the connection address (it was not started through the SignalHub supervisor), so Auto cannot tell a proxy from a visitor.");
  } else if (proxyForwarded && privatePeer) {
    behindProxy = "yes";
    reasons.push(`The connection comes from ${peer}, a ${kind} address, and carries a forwarded client address: a reverse proxy is in front of this server.`);
    if (current.cidrs?.length && !peerIsTrusted(peer, { ...current, mode: "auto" })) {
      reasons.push(`This proxy (${peer}) is outside your trusted ranges (${current.cidrs.join(", ")}), so its forwarded address is ignored.`);
    } else {
      reasons.push("Auto already trusts the forwarded address from private addresses, so no manual setting is needed.");
    }
    const visitor = resolveClientIp(headers, { mode: "auto", hops: Math.min(MAX_PROXY_HOPS, Math.max(1, forwardedFor.length)), cidrs: [] }, peerTrusted);
    if (peerKind(visitor) === "private" || peerKind(visitor) === "loopback") {
      reasons.push(`The visitor address in the forwarded header (${visitor}) is itself a private address. If you expect public visitors, something in front of this server is not passing the visitor's real address on (Kubernetes: use externalTrafficPolicy: Local or PROXY protocol; check the load balancer's forwarded-header settings). Visiting from inside your own network looks the same.`);
    }
  } else if (proxyForwarded && hints.length) {
    behindProxy = "yes";
    recommendedMode = "on";
    reasons.push(`This request passed through ${hints.join(", ")}, which connects from a public address (${peer}).`);
    reasons.push("Auto ignores forwarded addresses from public connections, so choose On to read the real visitor address.");
  } else if (proxyForwarded) {
    behindProxy = "no";
    reasons.push(`A forwarded address (${forwardedFor.join(", ")}) arrived on a connection from public address ${peer}. Without a known proxy, that header is ignored by Auto: anyone can send one.`);
  } else {
    behindProxy = "no";
    reasons.push(`The connection comes straight from ${peer} (${kind}) with no proxy header: nothing sits in front of this server right now.`);
    reasons.push("Auto behaves like Off here and switches itself on if you later put a proxy on a private network in front.");
  }

  const suggestedHops = behindProxy === "yes" ? Math.min(MAX_PROXY_HOPS, Math.max(1, forwardedFor.length)) : current.hops;
  const forMode = (mode: ProxyTrustMode) => resolveClientIp(headers, { mode, hops: suggestedHops, cidrs: current.cidrs }, peerTrusted);
  return {
    peer,
    peerKind: kind,
    forwardedFor,
    hints,
    protocol: headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || null,
    behindProxy,
    recommendedMode,
    suggestedHops,
    clientIpByMode: { auto: forMode("auto"), on: forMode("on"), off: forMode("off") },
    proxyHeaderPresent: proxyForwarded,
    peerTrusted: peer ? peerIsTrusted(peer, { ...current, mode: current.mode === "off" ? "auto" : current.mode }) : null,
    suggestedCidr: suggestCidr(peer),
    reasons,
  };
}

export type ModeExplanation = { title: string; summary: string; why: string[]; caution?: string };

/** Plain-language text for each choice, tailored to what the diagnosis found. */
export function explainModes(diagnosis: ProxyDiagnosis): Record<ProxyTrustMode, ModeExplanation> {
  const proxied = diagnosis.behindProxy === "yes";
  const direct = diagnosis.behindProxy === "no";
  return {
    auto: {
      title: "Auto",
      summary: "SignalHub decides for each request.",
      why: [
        "Trusts the forwarded visitor address only when the connection comes from a private or loopback address, where reverse proxies normally run.",
        "A visitor connecting from the public internet cannot choose their own address, so rate limits and IP allowlists stay safe.",
        "Works unchanged if you move between local, Docker, Kubernetes and PaaS hosting.",
        "Optionally pin it to your proxy's network range, so a neighbour on the same private network cannot forge an address either.",
      ],
      caution: proxied || direct ? undefined : "Does not recognise a proxy that connects from a public address (for example a CDN straight to your server). Choose On for that.",
    },
    on: {
      title: "On",
      summary: "Always trust X-Forwarded-For.",
      why: [
        "Needed when your proxy or CDN reaches this server from a public address, where Auto would ignore its header.",
        "Set the number of proxies in front of the server so the right entry of the header is used.",
        "Add your CDN's published network ranges so only it is believed.",
      ],
      caution: direct
        ? "Nothing proxies this server right now. With On, any visitor can forge their address to dodge login rate limits and pass IP allowlists."
        : "Only use On when the proxy is the only way to reach this server. Otherwise visitors can forge their address.",
    },
    off: {
      title: "Off",
      summary: "Never trust forwarded headers.",
      why: [
        "Uses the address of the TCP connection. Nothing a visitor sends can change it.",
        "The right choice when visitors connect straight to this server with no proxy.",
      ],
      caution: proxied
        ? "A proxy is in front of this server. With Off, every visitor appears to come from the proxy, so they share one rate-limit allowance, IP allowlists cannot work, and audit logs lose the real address."
        : "If you later add a reverse proxy, everyone will appear to come from it until you switch this on.",
    },
  };
}

import { describe, expect, it } from "vitest";
import {
  diagnoseProxy,
  effectiveProxyTrust,
  envProxyTrust,
  explainModes,
  parseCidrs,
  peerKind,
  resolveClientIp,
} from "../lib/proxy-trust";

const PEER = "x-signalhub-peer";
const headers = (values: Record<string, string>) => new Headers(values);

describe("envProxyTrust", () => {
  it("reads true/false/auto and ignores blank or unknown values", () => {
    expect(envProxyTrust({ TRUST_PROXY_HEADERS: "true" }).mode).toBe("on");
    expect(envProxyTrust({ TRUST_PROXY_HEADERS: "false" }).mode).toBe("off");
    expect(envProxyTrust({ TRUST_PROXY_HEADERS: "AUTO" }).mode).toBe("auto");
    expect(envProxyTrust({ TRUST_PROXY_HEADERS: "" }).mode).toBeUndefined();
    expect(envProxyTrust({ TRUST_PROXY_HEADERS: "yes" }).mode).toBeUndefined();
    expect(envProxyTrust({}).mode).toBeUndefined();
  });

  it("reads TRUSTED_PROXY_CIDRS and ignores the whole value when any entry is invalid", () => {
    expect(envProxyTrust({ TRUSTED_PROXY_CIDRS: "10.0.0.0/8,fd00::/8" }).cidrs).toEqual(["10.0.0.0/8", "fd00::/8"]);
    expect(envProxyTrust({ TRUSTED_PROXY_CIDRS: "" }).cidrs).toBeUndefined();
    const bad = envProxyTrust({ TRUSTED_PROXY_CIDRS: "10.0.0.0/8, nope" });
    expect(bad.cidrs).toBeUndefined();
    expect(bad.cidrsInvalid).toEqual(["nope"]);
  });

  it("accepts hop counts from 1 to 10 only", () => {
    expect(envProxyTrust({ TRUSTED_PROXY_HOPS: "2" }).hops).toBe(2);
    for (const bad of ["0", "11", "x", "", "1.5"]) expect(envProxyTrust({ TRUSTED_PROXY_HOPS: bad }).hops).toBeUndefined();
  });
});

describe("effectiveProxyTrust", () => {
  it("lets the environment win over the admin setting and says where each value came from", () => {
    expect(effectiveProxyTrust({ TRUST_PROXY_HEADERS: "true" }, { mode: "off", hops: 3 })).toEqual({
      mode: "on", hops: 3, cidrs: [], modeSource: "environment", hopsSource: "admin", cidrsSource: "admin", cidrsInvalid: [],
    });
    expect(effectiveProxyTrust({}, { mode: "off", hops: 3, cidrs: ["10.0.0.0/8"] })).toEqual({
      mode: "off", hops: 3, cidrs: ["10.0.0.0/8"], modeSource: "admin", hopsSource: "admin", cidrsSource: "admin", cidrsInvalid: [],
    });
    expect(effectiveProxyTrust({ TRUSTED_PROXY_CIDRS: "192.168.0.0/16" }, { mode: "auto", hops: 1, cidrs: ["10.0.0.0/8"] })).toMatchObject({
      cidrs: ["192.168.0.0/16"], cidrsSource: "environment",
    });
    expect(effectiveProxyTrust({ TRUSTED_PROXY_HOPS: "2" }, { mode: "auto", hops: 1 }).hopsSource).toBe("environment");
  });
});

describe("peerKind", () => {
  it("classifies addresses", () => {
    expect(peerKind("127.0.0.1")).toBe("loopback");
    expect(peerKind("::1")).toBe("loopback");
    expect(peerKind("10.1.2.3")).toBe("private");
    expect(peerKind("172.18.0.4")).toBe("private");
    expect(peerKind("fd00::2")).toBe("private");
    expect(peerKind("203.0.113.9")).toBe("public");
    expect(peerKind("2606:4700:4700::1111")).toBe("public");
    expect(peerKind("unknown")).toBe("unknown");
    expect(peerKind(null)).toBe("unknown");
  });

  it("recognises the addresses PaaS and cloud proxies connect from, but not look-alikes", () => {
    for (const address of ["100.64.1.2", "169.254.169.126", "fe80::1", "fdaa:0:1::3"]) expect(peerKind(address)).toBe("private");
    // 6to4 and benchmarking ranges are public clients, not proxies.
    for (const address of ["2002:c000:204::1", "2002:7f00:1::1", "198.18.0.1", "64:ff9b::a00:1"]) expect(peerKind(address)).toBe("public");
  });
});

describe("parseCidrs", () => {
  it("accepts IPv4/IPv6 ranges and single addresses", () => {
    expect(parseCidrs("10.0.0.0/8, fd00::/8\n192.168.1.5")).toEqual({ cidrs: ["10.0.0.0/8", "fd00::/8", "192.168.1.5/32"], invalid: [] });
    expect(parseCidrs("")).toEqual({ cidrs: [], invalid: [] });
  });
  it("reports every invalid entry and keeps none of them", () => {
    expect(parseCidrs("10.0.0.0/33, banana, 10.0.0.0/8")).toEqual({ cidrs: ["10.0.0.0/8"], invalid: ["10.0.0.0/33", "banana"] });
    expect(parseCidrs("::1/129").invalid).toEqual(["::1/129"]);
  });
});

describe("resolveClientIp", () => {
  const auto = { mode: "auto", hops: 1 } as const;

  it("auto trusts X-Forwarded-For only from a private or loopback peer", () => {
    expect(resolveClientIp(headers({ [PEER]: "10.0.0.2", "x-forwarded-for": "198.51.100.4" }), auto, true)).toBe("198.51.100.4");
    expect(resolveClientIp(headers({ [PEER]: "127.0.0.1", "x-forwarded-for": "198.51.100.4" }), auto, true)).toBe("198.51.100.4");
    // A public client cannot pick its own identity.
    expect(resolveClientIp(headers({ [PEER]: "203.0.113.9", "x-forwarded-for": "1.2.3.4" }), auto, true)).toBe("203.0.113.9");
  });

  it("auto cannot tell who is connecting when the peer was not stamped", () => {
    expect(resolveClientIp(headers({ [PEER]: "10.0.0.2", "x-forwarded-for": "198.51.100.4" }), auto, false)).toBe("unknown");
  });

  it("on always trusts the header, off never does", () => {
    const forged = headers({ [PEER]: "203.0.113.9", "x-forwarded-for": "1.2.3.4" });
    expect(resolveClientIp(forged, { mode: "on", hops: 1 }, true)).toBe("1.2.3.4");
    expect(resolveClientIp(headers({ [PEER]: "10.0.0.2", "x-forwarded-for": "198.51.100.4" }), { mode: "off", hops: 1 }, true)).toBe("10.0.0.2");
    expect(resolveClientIp(headers({ "x-forwarded-for": "1.2.3.4" }), { mode: "off", hops: 1 }, false)).toBe("unknown");
  });

  it("counts hops from the right, ignoring entries a client prepended", () => {
    const chain = headers({ [PEER]: "10.0.0.2", "x-forwarded-for": "6.6.6.6, 1.1.1.1, 2.2.2.2" });
    expect(resolveClientIp(chain, { mode: "on", hops: 1 }, true)).toBe("2.2.2.2");
    expect(resolveClientIp(chain, { mode: "on", hops: 2 }, true)).toBe("1.1.1.1");
    expect(resolveClientIp(chain, { mode: "auto", hops: 3 }, true)).toBe("6.6.6.6");
  });

  it("records one spelling per client (IPv4-mapped IPv6 becomes plain IPv4)", () => {
    expect(resolveClientIp(headers({ [PEER]: "::ffff:10.0.0.2", "x-forwarded-for": "::FFFF:198.51.100.4" }), auto, true)).toBe("198.51.100.4");
    expect(resolveClientIp(headers({ [PEER]: "::ffff:203.0.113.9" }), auto, true)).toBe("203.0.113.9");
  });

  it("with a trusted range, Auto believes only peers inside it", () => {
    const pinned = { mode: "auto", hops: 1, cidrs: ["172.18.0.0/16"] } as const;
    expect(resolveClientIp(headers({ [PEER]: "172.18.0.3", "x-forwarded-for": "198.51.100.4" }), pinned, true)).toBe("198.51.100.4");
    // Private, but not the proxy: a neighbour on the network cannot forge an address.
    expect(resolveClientIp(headers({ [PEER]: "10.0.0.9", "x-forwarded-for": "6.6.6.6" }), pinned, true)).toBe("10.0.0.9");
    expect(resolveClientIp(headers({ [PEER]: "203.0.113.9", "x-forwarded-for": "6.6.6.6" }), pinned, true)).toBe("203.0.113.9");
  });

  it("with a trusted range, On believes only listed peers (public CDN ranges) and needs a visible peer", () => {
    const cdn = { mode: "on", hops: 1, cidrs: ["104.16.0.0/13"] } as const;
    expect(resolveClientIp(headers({ [PEER]: "104.16.0.1", "x-forwarded-for": "198.51.100.4" }), cdn, true)).toBe("198.51.100.4");
    expect(resolveClientIp(headers({ [PEER]: "203.0.113.9", "x-forwarded-for": "6.6.6.6" }), cdn, true)).toBe("203.0.113.9");
    expect(resolveClientIp(headers({ "x-forwarded-for": "6.6.6.6" }), cdn, false)).toBe("unknown");
  });

  it("matches IPv6 and IPv4-mapped peers against ranges", () => {
    expect(resolveClientIp(headers({ [PEER]: "fd00::5", "x-forwarded-for": "198.51.100.4" }), { mode: "auto", hops: 1, cidrs: ["fd00::/8"] }, true)).toBe("198.51.100.4");
    expect(resolveClientIp(headers({ [PEER]: "::ffff:172.18.0.3", "x-forwarded-for": "198.51.100.4" }), { mode: "auto", hops: 1, cidrs: ["172.18.0.0/16"] }, true)).toBe("198.51.100.4");
  });

  it("falls back to X-Real-IP, then the peer", () => {
    expect(resolveClientIp(headers({ [PEER]: "10.0.0.2", "x-real-ip": "198.51.100.8" }), auto, true)).toBe("198.51.100.8");
    expect(resolveClientIp(headers({ [PEER]: "10.0.0.2" }), auto, true)).toBe("10.0.0.2");
  });
});

describe("diagnoseProxy", () => {
  const current = { mode: "auto", hops: 1 } as const;

  it("suggests the proxy's network as a trusted range, and says whether it is already trusted", () => {
    const k8s = diagnoseProxy(headers({ [PEER]: "10.244.3.7", "x-forwarded-for": "198.51.100.4" }), current, true);
    expect(k8s).toMatchObject({ suggestedCidr: "10.244.0.0/16", peerTrusted: true });
    const pinnedElsewhere = diagnoseProxy(headers({ [PEER]: "10.244.3.7", "x-forwarded-for": "198.51.100.4" }), { ...current, cidrs: ["172.18.0.0/16"] }, true);
    expect(pinnedElsewhere.peerTrusted).toBe(false);
    expect(diagnoseProxy(headers({ [PEER]: "127.0.0.1" }), current, true).suggestedCidr).toBeNull();
    expect(diagnoseProxy(headers({ [PEER]: "203.0.113.9" }), current, true).suggestedCidr).toBeNull();
    expect(diagnoseProxy(headers({ [PEER]: "fd12:3456:789a:1::9", "x-forwarded-for": "198.51.100.4" }), current, true).suggestedCidr).toBe("fd12:3456:789a:1::/64");
  });

  it("warns when the visitor address behind a proxy is itself private (source address rewritten upstream)", () => {
    const rewritten = diagnoseProxy(headers({ [PEER]: "10.244.3.7", "x-forwarded-for": "10.0.0.5" }), current, true);
    expect(rewritten.reasons.join(" ")).toMatch(/not passing the visitor/i);
    // A proxy that forwards a public visitor does not trigger it.
    expect(diagnoseProxy(headers({ [PEER]: "10.244.3.7", "x-forwarded-for": "198.51.100.4" }), current, true).reasons.join(" ")).not.toMatch(/not passing the visitor/i);
  });

  it("sees a direct connection even when Next writes the peer in IPv4-mapped form", () => {
    const local = diagnoseProxy(headers({ [PEER]: "127.0.0.1", "x-forwarded-for": "::ffff:127.0.0.1" }), current, true);
    expect(local).toMatchObject({ behindProxy: "no", forwardedFor: ["127.0.0.1"] });
    expect(local.clientIpByMode).toEqual({ auto: "127.0.0.1", on: "127.0.0.1", off: "127.0.0.1" });
  });

  it("recognises a proxy on a private network and suggests the hop count", () => {
    const one = diagnoseProxy(headers({ [PEER]: "172.18.0.3", "x-forwarded-for": "198.51.100.4", "x-forwarded-proto": "https" }), current, true);
    expect(one).toMatchObject({ peer: "172.18.0.3", peerKind: "private", behindProxy: "yes", recommendedMode: "auto", suggestedHops: 1 });
    expect(one.clientIpByMode).toEqual({ auto: "198.51.100.4", on: "198.51.100.4", off: "172.18.0.3" });

    const two = diagnoseProxy(headers({ [PEER]: "172.18.0.3", "x-forwarded-for": "198.51.100.4, 130.176.0.1" }), current, true);
    expect(two.suggestedHops).toBe(2);
  });

  it("sees a direct connection (Next fills the header with the peer itself)", () => {
    const direct = diagnoseProxy(headers({ [PEER]: "203.0.113.9", "x-forwarded-for": "203.0.113.9" }), current, true);
    expect(direct).toMatchObject({ behindProxy: "no", recommendedMode: "auto", peerKind: "public" });
    const local = diagnoseProxy(headers({ [PEER]: "127.0.0.1", "x-forwarded-for": "127.0.0.1" }), current, true);
    expect(local).toMatchObject({ behindProxy: "no", peerKind: "loopback", recommendedMode: "auto" });
  });

  it("recommends On for a proxy that connects from a public address", () => {
    const cdn = diagnoseProxy(headers({ [PEER]: "104.16.0.1", "x-forwarded-for": "198.51.100.4", "cf-ray": "abc-LHR" }), current, true);
    expect(cdn).toMatchObject({ behindProxy: "yes", recommendedMode: "on", hints: ["Cloudflare"] });
    expect(cdn.clientIpByMode.auto).toBe("104.16.0.1");
    expect(cdn.clientIpByMode.on).toBe("198.51.100.4");
  });

  it("treats a public client sending its own header as spoofing, not a proxy", () => {
    const forged = diagnoseProxy(headers({ [PEER]: "203.0.113.9", "x-forwarded-for": "1.2.3.4" }), current, true);
    expect(forged).toMatchObject({ behindProxy: "no", recommendedMode: "auto" });
    expect(forged.reasons.join(" ")).toMatch(/ignored/i);
  });

  it("says so when the connection address is not visible", () => {
    expect(diagnoseProxy(headers({ "x-forwarded-for": "1.2.3.4" }), current, false)).toMatchObject({ behindProxy: "unknown", peer: null });
  });
});

describe("explainModes", () => {
  it("warns about the real consequence of a bad choice", () => {
    const proxied = diagnoseProxy(headers({ [PEER]: "10.0.0.2", "x-forwarded-for": "198.51.100.4" }), { mode: "auto", hops: 1 }, true);
    expect(explainModes(proxied).off.caution).toMatch(/share/i);
    const direct = diagnoseProxy(headers({ [PEER]: "203.0.113.9", "x-forwarded-for": "203.0.113.9" }), { mode: "auto", hops: 1 }, true);
    expect(explainModes(direct).on.caution).toMatch(/forge|spoof|fake/i);
    expect(Object.keys(explainModes(direct))).toEqual(["auto", "on", "off"]);
  });
});

import { describe, expect, it } from "vitest";
import { domainEligibility, monitorHostname, registrableCandidates } from "../lib/domain-name";
import { expiryAlert, expiryPhrase } from "../lib/expiry";
import { parseRdapExpiry, rdapServers } from "../lib/rdap";

const DAY = 86_400_000;
const now = new Date("2026-10-10T00:00:00Z");
const inDays = (days: number) => new Date(now.getTime() + days * DAY);

describe("expiryAlert", () => {
  it("stays quiet until the expiry is inside the warning window", () => {
    expect(expiryAlert({ expiresAt: inDays(30), warnDays: 14, notifiedFor: null, now })).toEqual({ notify: false, daysLeft: 30 });
    expect(expiryAlert({ expiresAt: inDays(14), warnDays: 14, notifiedFor: null, now }).notify).toBe(true);
    expect(expiryAlert({ expiresAt: inDays(3), warnDays: 14, notifiedFor: null, now })).toEqual({ notify: true, daysLeft: 3 });
  });

  it("warns once per expiry date, and again for the renewed date", () => {
    const expiresAt = inDays(5);
    expect(expiryAlert({ expiresAt, warnDays: 14, notifiedFor: expiresAt, now }).notify).toBe(false);
    // A renewal moves the date; nothing is due yet, then the next period warns.
    const renewed = inDays(365);
    expect(expiryAlert({ expiresAt: renewed, warnDays: 14, notifiedFor: expiresAt, now }).notify).toBe(false);
    const later = new Date(now.getTime() + 360 * DAY);
    expect(expiryAlert({ expiresAt: renewed, warnDays: 14, notifiedFor: expiresAt, now: later }).notify).toBe(true);
  });

  it("still warns, with a negative day count, when it has already expired", () => {
    expect(expiryAlert({ expiresAt: inDays(-2), warnDays: 14, notifiedFor: null, now })).toEqual({ notify: true, daysLeft: -2 });
  });
});

describe("expiryPhrase", () => {
  it("reads naturally around zero", () => {
    expect([5, 1, 0, -1, -3].map(expiryPhrase)).toEqual(["expires in 5 days", "expires in 1 day", "expires today", "expired 1 day ago", "expired 3 days ago"]);
  });
});

describe("domain eligibility", () => {
  it("extracts the host from URLs and bare hosts, and skips heartbeats", () => {
    expect(monitorHostname("HTTP", "https://API.Example.com:8443/health?x=1")).toBe("api.example.com");
    expect(monitorHostname("TCP", "db.example.com")).toBe("db.example.com");
    expect(monitorHostname("HTTP", "http://[::1]:3000/")).toBe("::1");
    expect(monitorHostname("HEARTBEAT", "inbound-heartbeat")).toBeNull();
    expect(monitorHostname("HTTP", "")).toBeNull();
  });

  it("rejects hosts that have no publicly registered domain", () => {
    for (const host of ["10.0.0.1", "::1", "localhost", "intranet", "printer.local", "svc.internal", null]) {
      expect(domainEligibility(host).ok, String(host)).toBe(false);
    }
    expect(domainEligibility("status.example.com")).toMatchObject({ ok: true, labels: ["status", "example", "com"] });
  });

  it("tries the last two labels, then three for suffixes like co.uk", () => {
    expect(registrableCandidates(["www", "example", "com"])).toEqual(["example.com", "www.example.com"]);
    expect(registrableCandidates(["example", "com"])).toEqual(["example.com"]);
    expect(registrableCandidates(["shop", "example", "co", "uk"])).toEqual(["co.uk", "example.co.uk"]);
  });
});

describe("RDAP parsing", () => {
  it("maps TLDs to the https server of the IANA bootstrap file", () => {
    const servers = rdapServers({ services: [[["com", "net"], ["http://rdap.example/com/", "https://rdap.example/com/"]], [["org"], ["https://rdap.example/org/"]]] });
    expect(servers.get("com")).toBe("https://rdap.example/com/");
    expect(servers.get("net")).toBe("https://rdap.example/com/");
    expect(servers.get("xyz")).toBeUndefined();
  });

  it("reads the expiration event from a domain response", () => {
    const body = { events: [{ eventAction: "registration", eventDate: "2020-01-01T00:00:00Z" }, { eventAction: "expiration", eventDate: "2027-03-04T05:06:07Z" }] };
    expect(parseRdapExpiry(body)?.toISOString()).toBe("2027-03-04T05:06:07.000Z");
    expect(parseRdapExpiry({ events: [] })).toBeNull();
    expect(parseRdapExpiry({ events: [{ eventAction: "expiration", eventDate: "soon" }] })).toBeNull();
    expect(parseRdapExpiry(null)).toBeNull();
  });
});

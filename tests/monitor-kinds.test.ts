import { describe, expect, it } from "vitest";
import { hostAndPort, kindOfType, MONITOR_KINDS, monitorTypeLabel, sameKind, typeForKind } from "../lib/monitor-kinds";

describe("monitor kinds", () => {
  it("maps every stored type to one of the five kinds the form offers", () => {
    const kinds = new Set(MONITOR_KINDS.map((option) => option.kind));
    for (const type of ["HTTP", "KEYWORD", "TCP", "TLS", "SSL", "ICMP", "PING", "DNS", "HEARTBEAT"]) {
      expect(kinds.has(kindOfType(type)), type).toBe(true);
    }
    expect(MONITOR_KINDS).toHaveLength(5);
  });

  it("turns a kind back into the stored type; ports pick TCP or TLS from the certificate check", () => {
    expect(typeForKind("WEBSITE")).toBe("HTTP");
    expect(typeForKind("PORT")).toBe("TCP");
    expect(typeForKind("PORT", true)).toBe("TLS");
    expect(typeForKind("PING")).toBe("ICMP");
    expect(typeForKind("JOB")).toBe("HEARTBEAT");
  });

  it("allows a type change only inside its kind", () => {
    expect(sameKind("KEYWORD", "HTTP")).toBe(true);
    expect(sameKind("TCP", "TLS")).toBe(true);
    expect(sameKind("HTTP", "TCP")).toBe(false);
    expect(sameKind("HEARTBEAT", "HTTP")).toBe(false);
    expect(sameKind("HTTP", "NOPE")).toBe(false);
  });

  it("splits an https:// target of a TLS monitor into host and port", () => {
    expect(hostAndPort("TLS", "https://example.com:8443/x", null)).toEqual({ host: "example.com", port: 8443 });
    expect(hostAndPort("TLS", "https://example.com", null)).toEqual({ host: "example.com", port: 443 });
    expect(hostAndPort("TLS", "example.com", 993)).toEqual({ host: "example.com", port: 993 });
    expect(hostAndPort("HTTP", "https://example.com/a", null)).toEqual({ host: "https://example.com/a", port: null });
  });

  it("gives every card a one-liner and every section of the details dialog", () => {
    for (const option of MONITOR_KINDS) {
      expect(option.description.length, option.title).toBeGreaterThan(20);
      expect(option.overview.length, option.title).toBeGreaterThan(40);
      for (const list of [option.whenToUse, option.howToUse, option.settings, option.examples, option.goodToKnow, option.troubleshooting]) expect(list.length, option.title).toBeGreaterThan(0);
    }
  });

  it("labels types for the monitor list", () => {
    expect(["HTTP", "KEYWORD", "TCP", "TLS", "ICMP", "DNS", "HEARTBEAT"].map(monitorTypeLabel)).toEqual(["Website", "Website", "Port", "Port + certificate", "Ping", "DNS", "Job"]);
  });
});

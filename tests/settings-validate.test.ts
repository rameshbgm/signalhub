import { describe, expect, it } from "vitest";
import { diagnoseProxy } from "../lib/proxy-trust";
import { validateConfiguration, type Proposal } from "../lib/settings/validate";

const PEER = "x-signalhub-peer";
const auto = { mode: "auto", hops: 1, cidrs: [] } as const;
const diagnosis = (values: Record<string, string>, proxy: Proposal["proxy"] = auto) => diagnoseProxy(new Headers(values), proxy, true);
const proxiedHeaders = { [PEER]: "10.244.3.7", "x-forwarded-for": "198.51.100.4", "x-forwarded-proto": "https" };
const directHeaders = { [PEER]: "203.0.113.9", "x-forwarded-for": "203.0.113.9" };

function check(overrides: Partial<Proposal>, headers: Record<string, string> = proxiedHeaders, request: { host: string | null; scheme: "https" | "http" | null; ownAddress?: string } = { host: "status.example.com", scheme: "https" }) {
  const proxy = overrides.proxy ?? auto;
  return validateConfiguration(
    { proxy, settings: {}, ...overrides },
    { diagnosis: diagnosis(headers, proxy), host: request.host, scheme: request.scheme, ownAddress: request.ownAddress ?? "198.51.100.4" },
  );
}
const ids = (findings: ReturnType<typeof check>) => findings.map((finding) => finding.id);
const find = (findings: ReturnType<typeof check>, id: string) => findings.find((finding) => finding.id === id);

describe("validateConfiguration", () => {
  it("is quiet for a sound configuration", () => {
    const findings = check({ settings: { publicUrl: "https://status.example.com" } });
    expect(findings.filter((finding) => finding.severity !== "info")).toEqual([]);
  });

  it("warns when On is chosen but nothing proxies the server, and when Off is chosen behind a proxy", () => {
    expect(find(check({ proxy: { mode: "on", hops: 1, cidrs: [] } }, directHeaders), "proxy.on-without-proxy")).toMatchObject({ severity: "warning", setting: "proxy" });
    expect(find(check({ proxy: { mode: "off", hops: 1, cidrs: [] } }), "proxy.off-behind-proxy")).toMatchObject({ severity: "warning" });
    expect(ids(check({ proxy: { mode: "on", hops: 1, cidrs: ["104.16.0.0/13"] } }, directHeaders))).not.toContain("proxy.on-without-proxy");
  });

  it("blocks a trusted range that leaves out the proxy in front, and offers the fix", () => {
    const finding = find(check({ proxy: { mode: "auto", hops: 1, cidrs: ["172.18.0.0/16"] } }), "proxy.range-excludes-proxy")!;
    expect(finding.severity).toBe("error");
    expect(finding.fix?.proxy?.cidrs).toEqual(["10.244.0.0/16"]);
  });

  it("notes when the hop count differs from the forwarded chain", () => {
    const finding = find(check({ proxy: { mode: "auto", hops: 3, cidrs: [] } }), "proxy.hops-differ")!;
    expect(finding.severity).toBe("warning");
    expect(finding.fix?.proxy?.hops).toBe(1);
  });

  it("warns when the visitor address behind the proxy is itself private", () => {
    const rewritten = { [PEER]: "10.244.3.7", "x-forwarded-for": "10.0.0.5" };
    expect(find(check({}, rewritten), "proxy.visitor-private")).toMatchObject({ severity: "warning" });
  });

  it("flags a public address that disagrees with how the site is being reached", () => {
    expect(find(check({ settings: { publicUrl: "http://status.example.com" } }), "url.scheme-mismatch")).toMatchObject({ severity: "warning" });
    const hostMismatch = find(check({ settings: { publicUrl: "https://other.example.org" } }), "url.host-mismatch")!;
    expect(hostMismatch.severity).toBe("warning");
    expect(hostMismatch.fix?.settings?.publicUrl).toBe("https://status.example.com");
    // localhost and IP access are not worth a warning
    expect(ids(check({ settings: { publicUrl: "https://status.example.com" } }, directHeaders, { host: "localhost:3301", scheme: "http" }))).not.toContain("url.host-mismatch");
  });

  it("blocks Secure cookies that nobody could sign in with", () => {
    const finding = find(check({ settings: { secureCookies: "always", publicUrl: "http://10.0.0.5:3301" } }, directHeaders, { host: "10.0.0.5:3301", scheme: "http" }), "https.secure-needs-https")!;
    expect(finding.severity).toBe("error");
    expect(finding.fix?.settings?.secureCookies).toBe("auto");
    // https is fine, and localhost is exempt from the Secure rule in browsers
    expect(ids(check({ settings: { secureCookies: "always", publicUrl: "https://status.example.com" } }))).not.toContain("https.secure-needs-https");
    expect(ids(check({ settings: { secureCookies: "always" } }, directHeaders, { host: "localhost:3301", scheme: "http" }))).not.toContain("https.secure-needs-https");
  });

  it("warns that HSTS cannot take effect over HTTP, and notes unencrypted public access", () => {
    expect(find(check({ settings: { hsts: "on", publicUrl: "http://status.example.com" } }), "hsts.needs-https")).toMatchObject({ severity: "warning" });
    expect(find(check({}, directHeaders, { host: "status.example.com", scheme: "http" }), "https.unencrypted")).toMatchObject({ severity: "info" });
  });

  it("blocks an admin network list that excludes the operator", () => {
    const finding = find(check({ settings: { adminCidrs: ["192.0.2.0/24"] } }), "admin.excludes-you")!;
    expect(finding.severity).toBe("error");
    expect(finding.fix?.settings?.adminCidrs).toEqual(["198.51.100.4/32"]);
    expect(ids(check({ settings: { adminCidrs: ["198.51.100.0/24"] } }))).not.toContain("admin.excludes-you");
    expect(ids(check({ settings: { adminCidrs: [] } }))).not.toContain("admin.excludes-you");
  });

  it("explains policy interactions and risky monitor options without blocking", () => {
    expect(find(check({ settings: { sessionIdleSeconds: 86400, sessionAbsoluteSeconds: 3600 } }), "policy.idle-exceeds-absolute")).toMatchObject({ severity: "info" });
    expect(find(check({ settings: { monitorAllowPrivateTargets: true } }), "monitor.private-targets")).toMatchObject({ severity: "info" });
  });

  it("reports an invalid value as an error on that setting", () => {
    const findings = check({ settings: { publicUrl: "javascript:alert(1)" as unknown as string } });
    expect(find(findings, "value.invalid.publicUrl")).toMatchObject({ severity: "error", setting: "publicUrl" });
  });

  it("orders blocking findings first", () => {
    const findings = check({ proxy: { mode: "auto", hops: 3, cidrs: ["172.18.0.0/16"] }, settings: { monitorAllowPrivateTargets: true } });
    const order = findings.map((finding) => finding.severity);
    expect(order).toEqual([...order].sort((a, b) => ["error", "warning", "info"].indexOf(a) - ["error", "warning", "info"].indexOf(b)));
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildReview, currentConfiguration, requiresConfirmation, resolveProposal, type ProposalInput } from "../lib/settings/review";

const PEER = "x-signalhub-peer";
const marker = Symbol.for("signalhub.peerHeader");
// The server sets this at startup (scripts/peer-address.mjs); without it the connection address is invisible.
beforeAll(() => { (globalThis as Record<symbol, unknown>)[marker] = true; });
afterAll(() => { delete (globalThis as Record<symbol, unknown>)[marker]; });
const proxied = () => new Headers({ [PEER]: "10.244.3.7", "x-forwarded-for": "198.51.100.4", "x-forwarded-proto": "https", host: "status.example.com" });
const base = (env: Record<string, string> = {}, stored: Record<string, unknown> = {}) =>
  currentConfiguration(env, stored, { mode: "auto", hops: 1, cidrs: [], modeSource: "admin", hopsSource: "admin", cidrsSource: "admin", cidrsInvalid: [] });
const input = (over: Partial<ProposalInput> = {}): ProposalInput => ({ proxy: { mode: "auto", hops: 1, cidrs: [] }, settings: {}, reset: [], ...over });

describe("currentConfiguration", () => {
  it("reports every setting's effective value and where it came from", () => {
    const current = base({ PASSWORD_MIN_LENGTH: "20" }, { sessionIdleSeconds: 7200 });
    expect(current.settings.passwordMinLength).toBe(20);
    expect(current.sources).toMatchObject({ passwordMinLength: "environment", sessionIdleSeconds: "admin", hsts: "default" });
  });
});

describe("resolveProposal", () => {
  it("records only what actually changes", () => {
    const current = base({}, { sessionIdleSeconds: 7200 });
    const resolved = resolveProposal(current, input({ settings: { sessionIdleSeconds: 7200, hsts: "on" } }));
    expect(resolved.storeChanges).toEqual({ hsts: "on" });
    expect(resolved.changedKeys).toEqual(["hsts"]);
    expect(resolved.proxyChanged).toBe(false);
  });

  it("does not save a value that equals what is already in force (so presets do not litter the settings)", () => {
    const resolved = resolveProposal(base(), input({ settings: { secureCookies: "auto", hsts: "auto", sessionIdleSeconds: 8 * 3600 } }));
    expect(resolved.storeChanges).toEqual({});
    // But an explicitly saved value that is being set back to the default is a change.
    expect(resolveProposal(base({}, { hsts: "on" }), input({ settings: { hsts: "auto" } })).storeChanges).toEqual({ hsts: "auto" });
  });

  it("never overrides a value the environment fixes, and says so", () => {
    const resolved = resolveProposal(base({ PASSWORD_MIN_LENGTH: "20" }), input({ settings: { passwordMinLength: 30 } }));
    expect(resolved.storeChanges).toEqual({});
    expect(resolved.ignoredLocked).toEqual(["passwordMinLength"]);
  });

  it("resets a setting to its default by deleting the saved value", () => {
    const resolved = resolveProposal(base({}, { sessionIdleSeconds: 7200 }), input({ reset: ["sessionIdleSeconds", "hsts"] }));
    expect(resolved.storeChanges).toEqual({ sessionIdleSeconds: undefined });
    expect(resolved.effective.sessionIdleSeconds).toBe(8 * 3600);
  });

  it("rejects bad proxy input as findings instead of throwing", () => {
    const resolved = resolveProposal(base(), input({ proxy: { mode: "on", hops: 99, cidrs: ["nope"] } }));
    expect(resolved.findings.map((finding) => finding.id)).toEqual(expect.arrayContaining(["proxy.hops-range", "proxy.cidrs-invalid"]));
    expect(resolved.findings.every((finding) => finding.severity === "error")).toBe(true);
  });

  it("detects a proxy change", () => {
    expect(resolveProposal(base(), input({ proxy: { mode: "on", hops: 1, cidrs: [] } })).proxyChanged).toBe(true);
  });
});

describe("requiresConfirmation", () => {
  it("is needed only for changes that could lock the administrator out", () => {
    expect(requiresConfirmation(["hsts", "passwordMinLength"], false)).toBe(false);
    expect(requiresConfirmation(["publicUrl"], false)).toBe(true);
    expect(requiresConfirmation(["adminCidrs"], false)).toBe(true);
    expect(requiresConfirmation(["secureCookies"], false)).toBe(true);
    expect(requiresConfirmation([], true)).toBe(true);
  });
});

describe("buildReview", () => {
  it("blocks on errors in what is being changed, but not on pre-existing problems elsewhere", () => {
    const blocked = buildReview(proxied(), input({ settings: { adminCidrs: ["192.0.2.0/24"] } }), base());
    expect(blocked.blocking).toBe(true);
    expect(blocked.findings.map((finding) => finding.id)).toContain("admin.excludes-you");

    // An admin list from the environment that already excludes you is not this change's fault.
    const env = base({ PLATFORM_ADMIN_ALLOWED_CIDRS: "192.0.2.0/24" });
    const unrelated = buildReview(proxied(), input({ settings: { hsts: "on" } }), env);
    expect(unrelated.blocking).toBe(false);
  });

  it("asks for acceptance of warnings and lists the changes", () => {
    const review = buildReview(proxied(), input({ proxy: { mode: "off", hops: 1, cidrs: [] }, settings: { hsts: "on" } }), base());
    expect(review.findings.find((finding) => finding.id === "proxy.off-behind-proxy")).toBeTruthy();
    expect(review.warningIds).toContain("proxy.off-behind-proxy");
    expect(review.changes.map((change) => change.id)).toEqual(expect.arrayContaining(["proxy.mode", "hsts"]));
    expect(review.needsConfirmation).toBe(true);
  });

  it("reads your address under the proposed proxy settings when checking admin networks", () => {
    // Auto resolves you to 198.51.100.4; Off would resolve you to the proxy 10.244.3.7.
    const allowsVisitor = buildReview(proxied(), input({ settings: { adminCidrs: ["198.51.100.0/24"] } }), base());
    expect(allowsVisitor.blocking).toBe(false);
    const off = buildReview(proxied(), input({ proxy: { mode: "off", hops: 1, cidrs: [] }, settings: { adminCidrs: ["198.51.100.0/24"] } }), base());
    expect(off.blocking).toBe(true);
  });
});

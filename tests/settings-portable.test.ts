import { describe, expect, it } from "vitest";
import { exportDocument, parseImport } from "../lib/settings/portable";

const snapshot = { proxy: { mode: "auto", hops: 1, cidrs: ["10.0.0.0/8"] }, settings: { hsts: "on", sessionIdleSeconds: 7200, rateLimits: { "login-ip": { limit: 30, windowSeconds: 900 } } } };

describe("export and import", () => {
  it("round-trips what an export contains", () => {
    const parsed = parseImport(JSON.stringify(exportDocument(snapshot)));
    expect(parsed).toEqual({ ok: true, snapshot });
  });

  it("rejects what could not be applied, naming every problem, and applies none of it", () => {
    const bad = parseImport(JSON.stringify({ version: 1, proxy: { mode: "sometimes", hops: 99, cidrs: ["nope"] }, settings: { hsts: "maybe", nothing: 1, rateLimits: { "login-account": { limit: 1, windowSeconds: 900 } } } }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      const text = bad.errors.join("\n");
      expect(text).toMatch(/proxy mode/i);
      expect(text).toMatch(/hops/i);
      expect(text).toMatch(/nope/);
      expect(text).toMatch(/hsts/i);
      expect(text).toMatch(/nothing/);
      expect(text).toMatch(/login-account/);
    }
  });

  it("rejects things that are not settings files", () => {
    expect(parseImport("not json").ok).toBe(false);
    expect(parseImport(JSON.stringify({ version: 2 })).ok).toBe(false);
    expect(parseImport(JSON.stringify([])).ok).toBe(false);
  });

  it("accepts a file with only some sections", () => {
    expect(parseImport(JSON.stringify({ version: 1, settings: { hsts: "off" } }))).toMatchObject({ ok: true, snapshot: { settings: { hsts: "off" } } });
  });
});

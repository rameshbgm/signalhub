import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { PEER_HEADER, trustedClientIp } from "../lib/network-policy";
import { totpCode, totpStep, verifyTotp } from "../lib/totp";

const marker = Symbol.for("signalhub.peerHeader");

afterEach(() => {
  vi.unstubAllEnvs();
  delete (globalThis as Record<symbol, unknown>)[marker];
});

describe("client IP for rate limits", () => {
  it("uses the socket peer stamped by the web preload", () => {
    (globalThis as Record<symbol, unknown>)[marker] = true;
    expect(trustedClientIp(new Headers({ [PEER_HEADER]: "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("ignores a peer header the preload did not stamp (client forgery)", () => {
    expect(trustedClientIp(new Headers({ [PEER_HEADER]: "203.0.113.7" }))).toBe("unknown");
  });

  it("still prefers X-Forwarded-For only behind a trusted proxy", () => {
    (globalThis as Record<symbol, unknown>)[marker] = true;
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    const headers = new Headers({ [PEER_HEADER]: "10.0.0.2", "x-forwarded-for": "198.51.100.4" });
    expect(trustedClientIp(headers)).toBe("198.51.100.4");
  });
});

describe("TOTP replay protection", () => {
  it("reports which time step a code belongs to", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const at = 1_800_000_000_000;
    const step = Math.floor(at / 30_000);
    expect(totpStep(secret, totpCode(secret, at), at)).toBe(step);
    expect(totpStep(secret, totpCode(secret, at - 30_000), at)).toBe(step - 1);
    expect(totpStep(secret, "000000", at)).toBeNull();
    expect(verifyTotp(secret, totpCode(secret, at), at)).toBe(true);
  });
});

describe("first-run setup gate", () => {
  it("does not let API paths through by file extension", async () => {
    vi.stubEnv("SIGNALHUB_SETUP_MODE", "db");
    const { proxy } = await import("../proxy");
    const api = await proxy(new NextRequest("http://localhost/api/v1/status/demo.json"));
    expect(api.status).toBe(503);
    const page = await proxy(new NextRequest("http://localhost/anything.json"));
    expect(page.headers.get("location")).toBe("http://localhost/setup");
    const home = await proxy(new NextRequest("http://localhost/"));
    expect(home.headers.get("location")).toBe("http://localhost/setup");
    const publicDir = path.join(process.cwd(), "public");
    const fixtureDir = mkdtempSync(path.join(publicDir, "setup-gate-test-"));
    try {
      const fixtureFile = path.join(fixtureDir, "asset.txt");
      writeFileSync(fixtureFile, "Setup gate static-file fixture");
      const assetPath = path.relative(publicDir, fixtureFile).split(path.sep).join("/");
      const asset = await proxy(new NextRequest(`http://localhost/${assetPath}`));
      expect(asset.headers.get("x-middleware-next")).toBe("1");
    } finally {
      rmSync(fixtureDir, { recursive: true });
    }
  });
});

describe("HSTS", () => {
  it("is sent only for HTTPS requests that reached us through a trusted proxy, with an HTTPS public address", async () => {
    (globalThis as Record<symbol, unknown>)[marker] = true;
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://status.example.com");
    const { proxy } = await import("../proxy");
    const https = await proxy(new NextRequest("https://status.example.com/login", { headers: { [PEER_HEADER]: "10.0.0.2", "x-forwarded-proto": "https" } }));
    expect(https.headers.get("strict-transport-security")).toBe("max-age=15552000");
    const plain = await proxy(new NextRequest("http://status.example.com/login", { headers: { [PEER_HEADER]: "10.0.0.2" } }));
    expect(plain.headers.get("strict-transport-security")).toBeNull();
    // A visitor on the public internet cannot make us send it by claiming https.
    const forged = await proxy(new NextRequest("http://status.example.com/login", { headers: { [PEER_HEADER]: "203.0.113.9", "x-forwarded-proto": "https" } }));
    expect(forged.headers.get("strict-transport-security")).toBeNull();
  });
});

import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

process.env.ENCRYPTION_KEY = "monitor-auth-test-key";

const { authConfigView, clearOAuthTokenCache, oauthAccessToken, readAuthConfig, resolveAuthConfig } = await import("../lib/monitor-auth");

const oauth = { kind: "OAUTH2" as const, tokenUrl: "https://auth.example.com/token", clientId: "id", clientSecret: "s3cret", scope: "", audience: "", credentialsIn: "body" as const };
const pem = "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----";
const keyPem = "-----BEGIN PRIVATE KEY-----\nBBBB\n-----END PRIVATE KEY-----";
const mtls = { kind: "MTLS" as const, cert: pem, key: keyPem, passphrase: "", ca: "" };

describe("resolveAuthConfig", () => {
  it("needs no config for auth types that use the plain columns", () => {
    expect(resolveAuthConfig("BASIC", null, null)).toBeNull();
    expect(resolveAuthConfig("NONE", oauth, null)).toBeNull();
  });

  it("encrypts OAuth2 settings and keeps the stored secret when the field is left blank", () => {
    const first = resolveAuthConfig("OAUTH2", oauth, null)!;
    expect(first).not.toContain("s3cret");
    const edited = resolveAuthConfig("OAUTH2", { ...oauth, clientSecret: "", scope: "read" }, first)!;
    expect(readAuthConfig(edited)).toMatchObject({ clientSecret: "s3cret", scope: "read" });
  });

  it("requires a client secret and a valid token URL", () => {
    expect(() => resolveAuthConfig("OAUTH2", { ...oauth, clientSecret: "" }, null)).toThrow(/client secret/);
    expect(() => resolveAuthConfig("OAUTH2", { ...oauth, tokenUrl: "ftp://x" }, null)).toThrow(/HTTP or HTTPS/);
    expect(() => resolveAuthConfig("OAUTH2", null, null)).toThrow(/OAuth2 settings are required/);
  });

  it("validates PEM input and keeps the stored private key when none is submitted", () => {
    expect(() => resolveAuthConfig("MTLS", { ...mtls, cert: "nope" }, null)).toThrow(/PEM/);
    expect(() => resolveAuthConfig("MTLS", { ...mtls, key: "" }, null)).toThrow(/private key is required/);
    const stored = resolveAuthConfig("MTLS", { ...mtls, passphrase: "pw" }, null)!;
    const edited = resolveAuthConfig("MTLS", { ...mtls, key: "", passphrase: "" }, stored)!;
    expect(readAuthConfig(edited)).toMatchObject({ key: keyPem, passphrase: "pw" });
  });

  it("never exposes secrets in the form view", () => {
    const view = authConfigView(resolveAuthConfig("OAUTH2", oauth, null));
    expect(view).toMatchObject({ clientId: "id", hasClientSecret: true });
    expect(JSON.stringify(view)).not.toContain("s3cret");
    expect(authConfigView("garbage")).toMatchObject({ hasClientSecret: false, hasKey: false });
  });
});

describe("oauthAccessToken", () => {
  let server: http.Server;
  let url = "";
  const requests: { auth: string | undefined; body: string }[] = [];

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        requests.push({ auth: request.headers.authorization, body });
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ access_token: `token-${requests.length}`, expires_in: 3600 }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/token`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
  beforeEach(() => { requests.length = 0; clearOAuthTokenCache(); });

  const options = { allowPrivate: true, timeoutMs: 2000 };

  it("posts client credentials in the body and caches the token", async () => {
    const config = { ...oauth, tokenUrl: url, scope: "read" };
    expect(await oauthAccessToken("m1", config, options)).toBe("token-1");
    expect(await oauthAccessToken("m1", config, options)).toBe("token-1");
    expect(requests).toHaveLength(1);
    const form = new URLSearchParams(requests[0].body);
    expect(Object.fromEntries(form)).toMatchObject({ grant_type: "client_credentials", client_id: "id", client_secret: "s3cret", scope: "read" });
    expect(requests[0].auth).toBeUndefined();
  });

  it("can send credentials as an HTTP Basic header instead", async () => {
    await oauthAccessToken("m2", { ...oauth, tokenUrl: url, credentialsIn: "basic" }, options);
    expect(requests[0].auth).toBe(`Basic ${Buffer.from("id:s3cret").toString("base64")}`);
    expect(new URLSearchParams(requests[0].body).has("client_secret")).toBe(false);
  });

  it("fetches a new token when the config changes", async () => {
    await oauthAccessToken("m3", { ...oauth, tokenUrl: url }, options);
    await oauthAccessToken("m3", { ...oauth, tokenUrl: url, scope: "other" }, options);
    expect(requests).toHaveLength(2);
  });

  it("refuses private token endpoints unless private targets are allowed", async () => {
    await expect(oauthAccessToken("m4", { ...oauth, tokenUrl: url }, { ...options, allowPrivate: false })).rejects.toThrow();
  });
});

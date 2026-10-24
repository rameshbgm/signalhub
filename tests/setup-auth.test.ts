import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { guardSetupRequest } from "@/lib/setup/http";
import { SETUP_COOKIE } from "@/lib/setup/token";
import { writeRuntimeConfig } from "@/lib/setup/config-file";
import { GET as backup } from "@/app/api/setup/backup/route";
import { GET as status } from "@/app/api/setup/status/route";
import { POST as unlock } from "@/app/api/setup/unlock/route";

const token = "synthetic-setup-token-only-for-tests-123456789";
const request = (headers: Record<string, string> = {}) => new NextRequest("https://status.example/setup", { headers: { host: "status.example", ...headers } });
beforeEach(() => { vi.stubEnv("SIGNALHUB_SETUP_MODE", "admin"); vi.stubEnv("SIGNALHUB_SETUP_TOKEN", token); });
afterEach(() => vi.unstubAllEnvs());

describe("setup operator authentication", () => {
  it.each<Record<string, string>>([{}, { authorization: "Bearer wrong" }, { cookie: `${SETUP_COOKIE}=wrong` }])("rejects missing or incorrect credentials: %j", async (headers) => {
    expect(guardSetupRequest(request(headers), "admin")?.status).toBe(401);
    expect((await backup(request(headers))).status).toBe(401);
    expect((await status(request(headers))).status).toBe(401);
  });
  it("fails closed when no token is configured", () => {
    vi.stubEnv("SIGNALHUB_SETUP_TOKEN", "");
    expect(guardSetupRequest(request({ authorization: `Bearer ${token}` }), "admin")?.status).toBe(401);
  });
  it("accepts operator bearer or cookie but still rejects cross-origin calls", () => {
    expect(guardSetupRequest(request({ authorization: `Bearer ${token}` }), "admin")).toBeNull();
    expect(guardSetupRequest(request({ cookie: `${SETUP_COOKIE}=${token}` }), "admin")).toBeNull();
    expect(guardSetupRequest(request({ cookie: `${SETUP_COOKIE}=${token}`, origin: "https://evil.example" }), "admin")?.status).toBe(403);
  });
  it("allows backup only with the token and refuses it after setup completes", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "signalhub-setup-auth-test-"));
    vi.stubEnv("SIGNALHUB_DATA_DIR", dir);
    try {
      await writeRuntimeConfig({ ENCRYPTION_KEY: "fake-test-key" });
      const authorized = request({ cookie: `${SETUP_COOKIE}=${token}` });
      expect((await backup(authorized)).status).toBe(200);
      vi.stubEnv("SIGNALHUB_SETUP_MODE", "");
      expect((await backup(authorized)).status).toBe(409);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it("issues an HttpOnly secure cookie only for the correct token", async () => {
    const post = (value: string) => unlock(new NextRequest("https://status.example/api/setup/unlock", {
      method: "POST", headers: { host: "status.example", origin: "https://status.example", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: value }),
    }));
    expect((await post("wrong")).headers.get("set-cookie")).toBeNull();
    const response = await post(token);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/setup");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(response.headers.get("set-cookie")).toContain("SameSite=strict");
    expect((await post("x".repeat(2048))).status).toBe(413);
  });
  it("invalidates old cookies after the supervisor token changes", () => {
    vi.stubEnv("SIGNALHUB_SETUP_TOKEN", "different-token-long-enough-for-tests-123456789");
    expect(guardSetupRequest(request({ cookie: `${SETUP_COOKIE}=${token}` }), "admin")?.status).toBe(401);
  });
});

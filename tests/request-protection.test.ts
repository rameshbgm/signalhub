import { describe, expect, it } from "vitest";
import { boundedBodyBytes, readRequestForm, readRequestJson, requestBodyLimit } from "@/lib/request-body";
import { guardApiRequest } from "@/lib/request-protection";

const request = (headers: Record<string, string> = {}, path = "/api/auth/login") => new Request(`https://status.example${path}`, { method: "POST", headers, body: "{}" });
describe("server-side request protection", () => {
  it("accepts same-origin writes and non-browser integrations, rejects hostile and null origins", () => {
    expect(guardApiRequest(request({ origin: "https://status.example" }))).toBeNull();
    expect(guardApiRequest(request())).toBeNull();
    for (const origin of ["https://evil.example", "https://status.example.evil.test", "null", "https://status.example/path"]) {
      expect(guardApiRequest(request({ origin }))?.status).toBe(403);
    }
    expect(guardApiRequest(request({ "sec-fetch-site": "cross-site" }))?.status).toBe(403);
    expect(guardApiRequest(request({ origin: "https://login.example" }, "/api/auth/saml/enterprise/acs"))).toBeNull();
    expect(guardApiRequest(request({ origin: "https://login.example" }, "/api/auth/saml/enterprise/start"))?.status).toBe(403);
  });
  it("handles the configured external origin behind a reverse proxy", () => {
    const proxy = new Request("http://localhost:3000/api/auth/login", { method: "POST", headers: { origin: "https://status.example", host: "backend.internal" } });
    expect(guardApiRequest(proxy, "https://status.example")).toBeNull();
    expect(guardApiRequest(proxy, "https://different.example")?.status).toBe(403);
  });
  it("rejects oversized declared bodies before reading and malformed JSON with 400", async () => {
    expect(guardApiRequest(request({ "content-length": "70000" }))?.status).toBe(413);
    expect((await readRequestJson(request({ "content-length": "70000" })) as Response).status).toBe(413);
    const invalid = await readRequestJson(new Request("https://status.example/api/test", { method: "POST", body: "{" }));
    expect((invalid as Response).status).toBe(400);
    expect(await readRequestJson(request())).toEqual({});
  });
  it("bounds chunked bodies regardless of a false Content-Length and cancels excess bytes", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(40000)); }, cancel() { cancelled = true; } });
    const chunked = new Request("https://status.example/api/test", { method: "POST", body: stream, headers: { "content-length": "1" }, duplex: "half" } as RequestInit);
    const response = await readRequestJson(chunked) as Response;
    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
  });
  it("times out a stalled body and releases its reader", async () => {
    const stream = new ReadableStream<Uint8Array>({ pull() {} });
    const stalled = new Request("https://status.example/api/test", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    await expect(boundedBodyBytes(stalled, 100, 10)).rejects.toMatchObject({ status: 408 });
    expect(stream.locked).toBe(false);
  });
  it("allows ordinary multipart uploads and retains separate upload and SCIM limits", async () => {
    const form = new FormData(); form.set("kind", "LOGO"); form.set("file", new Blob(["test"], { type: "image/png" }), "test.png");
    const upload = await readRequestForm(new Request("https://status.example/api/admin/pages/page/assets", { method: "POST", body: form }));
    expect(upload).toBeInstanceOf(FormData);
    expect((upload as FormData).get("kind")).toBe("LOGO");
    expect(requestBodyLimit("/api/admin/pages/page/assets")).toBe(6 * 1024 * 1024);
    expect(requestBodyLimit("/api/scim/v2/id/Groups")).toBe(2 * 1024 * 1024);
    const scim = await readRequestJson(new Request("https://status.example/api/scim/v2/id/Users", { method: "POST", body: "{" })) as Response;
    expect((await scim.json()).schemas).toContain("urn:ietf:params:scim:api:messages:2.0:Error");
  });
});

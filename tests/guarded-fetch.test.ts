import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BlockedAddressError, guardedFetch } from "../lib/guarded-fetch";

describe("guardedFetch", () => {
  let server: http.Server;
  let port = 0;

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        if (request.url === "/redirect") {
          response.writeHead(302, { location: "http://169.254.169.254/" }).end();
          return;
        }
        response.writeHead(201, { "content-type": "text/plain", "x-echo-method": request.method ?? "" });
        response.end(`echo:${body}`);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("blocks private IP literals and hostnames that resolve privately", async () => {
    await expect(guardedFetch(`http://127.0.0.1:${port}/`)).rejects.toBeInstanceOf(BlockedAddressError);
    await expect(guardedFetch("http://[::1]/")).rejects.toBeInstanceOf(BlockedAddressError);
    await expect(guardedFetch(`http://localhost:${port}/`)).rejects.toBeInstanceOf(BlockedAddressError);
  });

  it("performs requests when private destinations are explicitly allowed", async () => {
    const response = await guardedFetch(`http://localhost:${port}/`, {
      method: "POST",
      body: "hello",
      allowPrivate: true,
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("x-echo-method")).toBe("POST");
    expect(await response.text()).toBe("echo:hello");
  });

  it("returns redirects instead of following them", async () => {
    const response = await guardedFetch(`http://127.0.0.1:${port}/redirect`, { allowPrivate: true });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://169.254.169.254/");
  });

  it("rejects non-HTTP schemes", async () => {
    await expect(guardedFetch("file:///etc/passwd")).rejects.toThrow(/HTTP and HTTPS/);
  });
});

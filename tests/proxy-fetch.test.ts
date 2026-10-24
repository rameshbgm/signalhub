import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net, { type AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BlockedAddressError, guardedFetch } from "../lib/guarded-fetch";

const sockets = new Set<net.Socket>();

function listen(server: net.Server) {
  server.on("connection", (socket) => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  return new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));
}

function openssl() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "proxy-fetch-"));
  try {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", `${dir}/key.pem`, "-out", `${dir}/cert.pem`, "-days", "2", "-subj", "/CN=localhost"], { stdio: "ignore" });
    return { key: fs.readFileSync(`${dir}/key.pem`), cert: fs.readFileSync(`${dir}/cert.pem`) };
  } catch {
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("guardedFetch through a proxy", () => {
  const seen: { requestLine?: string; host?: string; proxyAuth?: string; connect?: string; socks?: string } = {};
  let origin: http.Server;
  let tlsOrigin: https.Server | null = null;
  let httpProxy: http.Server;
  let socksProxy: net.Server;
  let originPort = 0;
  let tlsPort = 0;
  let httpProxyPort = 0;
  let socksPort = 0;
  const tlsMaterial = openssl();

  beforeAll(async () => {
    origin = http.createServer((request, response) => { response.writeHead(200).end(`origin saw ${request.headers.host}`); });
    originPort = await listen(origin);
    if (tlsMaterial) {
      tlsOrigin = https.createServer(tlsMaterial, (_request, response) => { response.writeHead(200).end("secure origin"); });
      tlsPort = await listen(tlsOrigin);
    }

    httpProxy = http.createServer((request, response) => {
      seen.requestLine = request.url;
      seen.host = request.headers.host;
      seen.proxyAuth = request.headers["proxy-authorization"] as string | undefined;
      // Absolute-form request: forward it to the origin named in the URI.
      const target = new URL(request.url ?? "");
      http.get({ host: target.hostname, port: target.port, path: target.pathname, headers: { host: request.headers.host } }, (upstream) => {
        response.writeHead(upstream.statusCode ?? 502);
        upstream.pipe(response);
      });
    });
    httpProxy.on("connect", (request, clientSocket, head) => {
      seen.connect = request.url;
      seen.proxyAuth = request.headers["proxy-authorization"] as string | undefined;
      const [host, port] = (request.url ?? "").split(":");
      const upstream = net.connect(Number(port), host, () => {
        clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        upstream.pipe(clientSocket);
        clientSocket.pipe(upstream);
      });
      upstream.on("error", () => clientSocket.destroy());
    });
    httpProxyPort = await listen(httpProxy);

    // Minimal SOCKS5 server: no authentication, CONNECT to an IPv4 address only.
    socksProxy = net.createServer((client) => {
      client.once("data", () => {
        client.write(Buffer.from([5, 0]));
        client.once("data", (request: Buffer) => {
          const address = [...request.subarray(4, 8)].join(".");
          const port = request.readUInt16BE(8);
          seen.socks = `${address}:${port}`;
          const upstream = net.connect(port, address, () => {
            client.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
            upstream.pipe(client);
            client.pipe(upstream);
          });
          upstream.on("error", () => client.destroy());
        });
      });
    });
    socksPort = await listen(socksProxy);
  });

  afterAll(async () => {
    for (const socket of sockets) socket.destroy();
    await Promise.all([origin, tlsOrigin, httpProxy, socksProxy].map((server) => server && new Promise<void>((resolve) => server.close(() => resolve()))));
  });

  const proxy = (protocol: "HTTP" | "SOCKS5", port: number, extra = {}) => ({ protocol, host: "127.0.0.1", port, ...extra });

  it("sends plain HTTP as an absolute-form request to the pinned address, keeping the Host header", async () => {
    const response = await guardedFetch(`http://localhost:${originPort}/ping`, { allowPrivate: true, proxy: proxy("HTTP", httpProxyPort, { username: "u", password: "p" }) });
    expect(await response.text()).toBe(`origin saw localhost:${originPort}`);
    expect(seen.requestLine).toBe(`http://127.0.0.1:${originPort}/ping`);
    expect(seen.host).toBe(`localhost:${originPort}`);
    expect(seen.proxyAuth).toBe(`Basic ${Buffer.from("u:p").toString("base64")}`);
  });

  it.skipIf(!tlsMaterial)("tunnels HTTPS with CONNECT to the pinned address and still verifies certificates", async () => {
    const lenient = await guardedFetch(`https://localhost:${tlsPort}/`, { allowPrivate: true, rejectUnauthorized: false, proxy: proxy("HTTP", httpProxyPort, { username: "u", password: "p" }) });
    expect(await lenient.text()).toBe("secure origin");
    expect(seen.connect).toBe(`127.0.0.1:${tlsPort}`);
    expect(seen.proxyAuth).toBe(`Basic ${Buffer.from("u:p").toString("base64")}`);
    // The self-signed certificate is rejected end to end when verification is on.
    await expect(guardedFetch(`https://localhost:${tlsPort}/`, { allowPrivate: true, proxy: proxy("HTTP", httpProxyPort) })).rejects.toThrow(/self-signed|certificate/i);
  });

  it.skipIf(!tlsMaterial)("reports the server certificate expiry, directly and through a proxy", async () => {
    const seenDates: Date[] = [];
    const options = { allowPrivate: true, rejectUnauthorized: false, onPeerCertificate: (date: Date) => seenDates.push(date) };
    await (await guardedFetch(`https://localhost:${tlsPort}/`, options)).text();
    await (await guardedFetch(`https://localhost:${tlsPort}/`, { ...options, proxy: proxy("HTTP", httpProxyPort) })).text();
    expect(seenDates).toHaveLength(2);
    // The fixture certificate is valid for two days.
    const daysLeft = (seenDates[0].getTime() - Date.now()) / 86_400_000;
    expect(daysLeft).toBeGreaterThan(1);
    expect(daysLeft).toBeLessThan(2.1);
    expect(seenDates[1].getTime()).toBe(seenDates[0].getTime());
  });

  it("reaches the origin through a SOCKS5 proxy", async () => {
    const response = await guardedFetch(`http://localhost:${originPort}/`, { allowPrivate: true, proxy: proxy("SOCKS5", socksPort) });
    expect(await response.text()).toBe(`origin saw localhost:${originPort}`);
    expect(seen.socks).toBe(`127.0.0.1:${originPort}`);
  });

  it("refuses private targets before the proxy is contacted", async () => {
    seen.requestLine = undefined;
    await expect(guardedFetch(`http://localhost:${originPort}/`, { proxy: proxy("HTTP", httpProxyPort) })).rejects.toBeInstanceOf(BlockedAddressError);
    expect(seen.requestLine).toBeUndefined();
  });

  it("refuses a private proxy address unless private destinations are allowed", async () => {
    await expect(guardedFetch("http://93.184.216.34/", { proxy: proxy("HTTP", httpProxyPort) })).rejects.toBeInstanceOf(BlockedAddressError);
    await expect(guardedFetch("https://93.184.216.34/", { proxy: proxy("SOCKS5", socksPort) })).rejects.toBeInstanceOf(BlockedAddressError);
  });

  it("reports a failing proxy", async () => {
    const closed = net.createServer();
    const port = await listen(closed);
    await new Promise((resolve) => closed.close(resolve));
    await expect(guardedFetch(`http://localhost:${originPort}/`, { allowPrivate: true, proxy: proxy("HTTP", port) })).rejects.toThrow();
  });
});

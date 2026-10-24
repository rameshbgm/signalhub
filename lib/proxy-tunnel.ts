import http from "node:http";
import https from "node:https";
import net, { isIP } from "node:net";
import tls from "node:tls";
import { SocksClient } from "socks";

export type ProxyConfig = {
  protocol: "HTTP" | "HTTPS" | "SOCKS4" | "SOCKS5";
  host: string;
  port: number;
  username?: string | null;
  password?: string | null;
};

/** Resolves a hostname to the single address that will be used, rejecting blocked destinations. */
export type Pin = (hostname: string) => Promise<string>;

const HEAD_LIMIT = 8_192;

export function authority(address: string, port: number) {
  return `${address.includes(":") ? `[${address}]` : address}:${port}`;
}

/** Resolves once `event` fires; rejects (and destroys the socket) on error or abort. */
function ready(socket: net.Socket, event: "connect" | "secureConnect", signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => fail(new Error("Proxy connection aborted"));
    const fail = (error: Error) => {
      signal?.removeEventListener("abort", abort);
      socket.destroy();
      reject(error);
    };
    socket.once(event, () => {
      signal?.removeEventListener("abort", abort);
      socket.removeListener("error", fail);
      resolve();
    });
    socket.once("error", fail);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

export function proxyAuthorization(proxy: ProxyConfig) {
  if (!proxy.username) return undefined;
  return `Basic ${Buffer.from(`${proxy.username}:${proxy.password ?? ""}`).toString("base64")}`;
}

/** Connection to the proxy server itself (TLS for an HTTPS proxy). The proxy address is pinned like a target. */
export async function connectToProxy(proxy: ProxyConfig, pin: Pin, signal?: AbortSignal): Promise<net.Socket> {
  const address = await pin(proxy.host);
  if (proxy.protocol === "HTTPS") {
    const socket = tls.connect({ host: address, port: proxy.port, servername: isIP(proxy.host) ? undefined : proxy.host });
    await ready(socket, "secureConnect", signal);
    return socket;
  }
  const socket = net.connect({ host: address, port: proxy.port });
  await ready(socket, "connect", signal);
  return socket;
}

/** Asks an HTTP(S) proxy for a CONNECT tunnel to the already-pinned target address. */
async function connectTunnel(proxy: ProxyConfig, target: { address: string; port: number }, pin: Pin, signal?: AbortSignal) {
  const socket = await connectToProxy(proxy, pin, signal);
  const destination = authority(target.address, target.port);
  const auth = proxyAuthorization(proxy);
  socket.write(`CONNECT ${destination} HTTP/1.1\r\nHost: ${destination}\r\n${auth ? `Proxy-Authorization: ${auth}\r\n` : ""}\r\n`);
  const head = await new Promise<Buffer>((resolve, reject) => {
    let buffered = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk]);
      if (buffered.includes("\r\n\r\n")) done(null);
      else if (buffered.length > HEAD_LIMIT) done(new Error("Proxy sent an oversized response"));
    };
    const onEnd = () => done(new Error("Proxy closed the connection during CONNECT"));
    const done = (error: Error | null) => {
      socket.removeListener("data", onData);
      socket.removeListener("end", onEnd);
      socket.removeListener("error", done);
      if (error) { socket.destroy(); reject(error); } else resolve(buffered);
    };
    socket.on("data", onData);
    socket.once("end", onEnd);
    socket.once("error", done);
  });
  const end = head.indexOf("\r\n\r\n") + 4;
  const status = Number(/^HTTP\/1\.[01] (\d{3})/.exec(head.subarray(0, end).toString("latin1"))?.[1]);
  if (status !== 200) {
    socket.destroy();
    throw new Error(status === 407 ? "Proxy authentication failed" : `Proxy refused the connection (HTTP ${status || "invalid response"})`);
  }
  // Anything after the header already belongs to the tunnelled connection.
  if (head.length > end) socket.unshift(head.subarray(end));
  return socket;
}

async function socksTunnel(proxy: ProxyConfig, target: { address: string; port: number }, pin: Pin, signal?: AbortSignal) {
  if (proxy.protocol === "SOCKS4" && target.address.includes(":")) throw new Error("SOCKS4 proxies cannot reach IPv6 targets");
  const proxyAddress = await pin(proxy.host);
  const connection = SocksClient.createConnection({
    proxy: { host: proxyAddress, port: proxy.port, type: proxy.protocol === "SOCKS4" ? 4 : 5, userId: proxy.username ?? undefined, password: proxy.password ?? undefined },
    command: "connect",
    destination: { host: target.address, port: target.port },
    timeout: 15_000,
  }).then(({ socket }) => {
    if (signal?.aborted) socket.destroy();
    return socket;
  });
  if (!signal) return connection;
  return Promise.race([
    connection,
    new Promise<never>((_resolve, reject) => {
      const abort = () => reject(new Error("Proxy connection aborted"));
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
    }),
  ]);
}

/** A tunnel to the pinned target address. Only the proxy decides routing; it never resolves the target name. */
export function openTunnel(proxy: ProxyConfig, target: { address: string; port: number }, pin: Pin, signal?: AbortSignal) {
  return proxy.protocol === "SOCKS4" || proxy.protocol === "SOCKS5"
    ? socksTunnel(proxy, target, pin, signal)
    : connectTunnel(proxy, target, pin, signal);
}

type Connect = (options: { host?: string; servername?: string }, callback: (error: Error | null, socket?: net.Socket) => void) => void;

function withConnection<T extends http.Agent>(agent: T, connect: Connect) {
  (agent as unknown as { createConnection: Connect }).createConnection = connect;
  return agent;
}

/**
 * Agent whose sockets come from a proxy tunnel. HTTPS targets are wrapped in TLS
 * with the original hostname, so certificate checks still apply end to end.
 */
export function tunnelAgent(input: { proxy: ProxyConfig; pin: Pin; target: { address: string; port: number }; tlsTarget: boolean; signal?: AbortSignal }) {
  const { proxy, pin, target, tlsTarget, signal } = input;
  const open = (callback: (error: Error | null, socket?: net.Socket) => void, wrap: (socket: net.Socket) => net.Socket) => {
    openTunnel(proxy, target, pin, signal).then((socket) => {
      if (signal?.aborted) { socket.destroy(); return; }
      callback(null, wrap(socket));
    }, callback);
  };
  if (!tlsTarget) return withConnection(new http.Agent(), (_options, callback) => open(callback, (socket) => socket));
  // The request's own TLS options (rejectUnauthorized, client certificate, CA) arrive in `options`.
  return withConnection(new https.Agent(), (options, callback) => open(callback, (socket) => {
    const { host, ...rest } = options as tls.ConnectionOptions & { host?: string };
    const name = (host ?? "").replace(/^\[|\]$/g, "");
    return tls.connect({ ...rest, socket, servername: options.servername ?? (isIP(name) ? undefined : name) });
  }));
}

/** Agent for plain-HTTP targets through an HTTP(S) proxy: requests go to the proxy in absolute form. */
export function proxyHopAgent(proxy: ProxyConfig, pin: Pin, signal?: AbortSignal) {
  return withConnection(new http.Agent(), (_options, callback) => {
    connectToProxy(proxy, pin, signal).then((socket) => callback(null, socket), callback);
  });
}

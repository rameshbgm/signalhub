// Preloaded into the web process by scripts/start.ts (NODE_OPTIONS --import).
// Route handlers cannot see the TCP peer, and Next only fills X-Forwarded-For
// when the client sent none, so a client could pick its own rate-limit
// bucket. Stamp the socket address on every request instead, overwriting any
// client-sent value; lib/network-policy.ts reads it only when this ran.
import http from "node:http";

const emit = http.Server.prototype.emit;
http.Server.prototype.emit = function (event, request, ...rest) {
  if (event === "request") {
    const address = request.socket?.remoteAddress ?? "";
    request.headers["x-signalhub-peer"] = address.startsWith("::ffff:") ? address.slice(7) : address;
  }
  return emit.call(this, event, request, ...rest);
};
globalThis[Symbol.for("signalhub.peerHeader")] = true;

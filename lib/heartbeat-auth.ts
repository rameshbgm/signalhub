import { createHash, timingSafeEqual } from "node:crypto";
import { decryptSecret } from "@/lib/encryption";

export type HeartbeatAuthMonitor = { authType: string; authUsername: string | null; authSecret: string | null };

/** Compares through a digest so the comparison time does not depend on how much of the value matches. */
function same(a: string, b: string) {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

/** The challenge to send with a 401, or null when the heartbeat URL needs no credentials. */
export function heartbeatChallenge(monitor: Pick<HeartbeatAuthMonitor, "authType">) {
  if (monitor.authType === "BASIC") return 'Basic realm="SignalHub heartbeat", charset="UTF-8"';
  if (monitor.authType === "BEARER") return 'Bearer realm="SignalHub heartbeat"';
  return null;
}

/**
 * Whether a call to the heartbeat URL carries the credentials the monitor requires. The secret path
 * already identifies the monitor; Basic or Bearer credentials are a second factor on top of it.
 */
export function heartbeatAuthorized(monitor: HeartbeatAuthMonitor, authorization: string | null) {
  if (!heartbeatChallenge(monitor)) return true;
  if (!authorization || !monitor.authSecret) return false;
  const [scheme, ...rest] = authorization.trim().split(/\s+/);
  const credentials = rest.join(" ");
  const expected = decryptSecret(monitor.authSecret);
  if (monitor.authType === "BEARER") return scheme.toLowerCase() === "bearer" && same(credentials, expected);
  if (scheme.toLowerCase() !== "basic") return false;
  const decoded = Buffer.from(credentials, "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  if (colon < 0) return false;
  // Evaluate both so a wrong username and a wrong password take the same path.
  const userOk = same(decoded.slice(0, colon), monitor.authUsername ?? "");
  const passwordOk = same(decoded.slice(colon + 1), expected);
  return userOk && passwordOk;
}

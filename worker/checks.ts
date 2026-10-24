import { setting } from "@/lib/settings/effective";
import net from "node:net";
import tls from "node:tls";
import { spawn } from "node:child_process";
import type { MonitorRow } from "@/lib/postgres/schema";
import { validateHttpTarget, validateNetworkHost } from "@/lib/target-validation";
import { decryptSecret } from "@/lib/encryption";
import { guardedFetch, guardedLookup, pinnedAddress, type ProxyConfig } from "@/lib/guarded-fetch";
import { limitedResponseText, readResponsePreview, RESPONSE_PREVIEW_BYTES } from "@/lib/limited-response";
import { oauthAccessToken, readAuthConfig } from "@/lib/monitor-auth";
import { resolve4, resolve6, resolveCname, resolveMx, resolveNs, resolveTxt } from "node:dns/promises";
import { isExpectedStatus } from "@/lib/monitor-validation";
import { randomUUID } from "node:crypto";

export type CheckResult = {
  ok: boolean;
  latencyMs: number | null;
  statusCode: number | null;
  error: string | null;
  /** Server certificate expiry seen on an HTTPS target; set by HTTP and keyword checks. */
  certExpiresAt?: Date | null;
  /** Start of the response body, kept only for failed checks of monitors that opted in. */
  response?: string | null;
};

/** Settings needed for a check, including an unsaved configuration test. */
export type MonitorCheckInput = Pick<MonitorRow,
  | "id" | "type" | "target" | "port" | "method" | "requestBody" | "requestHeaders"
  | "expectedStatusRange" | "keywordMatch" | "keywordAbsent" | "authType" | "authUsername"
  | "authSecret" | "authHeaderName" | "authConfigCiphertext" | "timeoutMs" | "verifyTls"
  | "cacheBuster" | "ipFamily" | "sslWarnDays" | "saveErrorResponse" | "upsideDown"
  | "dnsRecordType" | "dnsExpectedValue" | "intervalSec" | "heartbeatGraceSec" | "lastHeartbeatAt" | "createdAt"
>;

function failure(started: number, error: string, statusCode: number | null = null): CheckResult {
  return { ok: false, latencyMs: Date.now() - started, statusCode, error };
}

function parseHeaders(value: string) {
  if (!value.trim()) return {} as Record<string, string>;
  const parsed: unknown = JSON.parse(value);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Request headers must be a JSON object");
  }
  const blocked = new Set(["host", "content-length", "connection", "transfer-encoding"]);
  const headers: Record<string, string> = {};
  for (const [name, raw] of Object.entries(parsed)) {
    if (blocked.has(name.toLowerCase())) throw new Error(`Header ${name} is not allowed`);
    if (typeof raw !== "string") throw new Error(`Header ${name} must be a string`);
    headers[name] = raw;
  }
  return headers;
}

/** Adds a random query parameter so CDNs and caches cannot answer for the origin. */
export function withCacheBuster(url: URL, token: string = randomUUID()) {
  const busted = new URL(url);
  busted.searchParams.set("_sh", token);
  return busted;
}

/** Flips the outcome for services that should be unreachable. Heartbeats push, so they are exempt. */
export function applyUpsideDown(result: CheckResult, monitor: Pick<MonitorRow, "upsideDown" | "type">): CheckResult {
  if (!monitor.upsideDown || monitor.type === "HEARTBEAT") return result;
  return result.ok
    ? { ...result, ok: false, error: "Service is reachable (upside-down mode)" }
    : { ...result, ok: true, error: null };
}

async function httpCheck(monitor: MonitorCheckInput, allowPrivate: boolean, proxy: ProxyConfig | null): Promise<CheckResult> {
  const started = Date.now();
  try {
    let url = await validateHttpTarget(monitor.target, { allowPrivate });
    const headers = parseHeaders(monitor.requestHeaders);
    const authSecret = monitor.authSecret ? decryptSecret(monitor.authSecret) : "";
    if (monitor.authType === "BASIC") {
      headers.authorization = `Basic ${Buffer.from(`${monitor.authUsername ?? ""}:${authSecret}`).toString("base64")}`;
    } else if (monitor.authType === "BEARER") {
      headers.authorization = `Bearer ${authSecret}`;
    } else if (monitor.authType === "HEADER" && monitor.authHeaderName) {
      headers[monitor.authHeaderName] = authSecret;
    }
    const authConfig = monitor.authConfigCiphertext ? readAuthConfig(monitor.authConfigCiphertext) : null;
    if (monitor.authType === "OAUTH2") {
      if (authConfig?.kind !== "OAUTH2") throw new Error("OAuth2 settings are missing");
      headers.authorization = `Bearer ${await oauthAccessToken(monitor.id, authConfig, { allowPrivate, timeoutMs: monitor.timeoutMs, proxy })}`;
    }
    if (monitor.authType === "MTLS" && authConfig?.kind !== "MTLS") throw new Error("mTLS settings are missing");
    const clientCertificate = monitor.authType === "MTLS" && authConfig?.kind === "MTLS"
      ? { cert: authConfig.cert, key: authConfig.key, passphrase: authConfig.passphrase, ca: authConfig.ca }
      : undefined;
    let response: Response | null = null;
    // Only the target's own certificate counts, not whatever a redirect lands on.
    const certificate: { expiresAt: Date | null } = { expiresAt: null };
    const family = monitor.ipFamily === "IPV4" ? 4 : monitor.ipFamily === "IPV6" ? 6 : undefined;
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      response = await guardedFetch(monitor.cacheBuster ? withCacheBuster(url) : url, {
        method: monitor.method,
        headers,
        body: ["GET", "HEAD"].includes(monitor.method) ? undefined : monitor.requestBody ?? undefined,
        signal: AbortSignal.timeout(monitor.timeoutMs),
        allowPrivate,
        family,
        rejectUnauthorized: monitor.verifyTls,
        clientCertificate,
        proxy,
        onPeerCertificate: redirects === 0 ? (expiresAt) => { certificate.expiresAt = expiresAt; } : undefined,
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("Too many or invalid redirects");
      url = await validateHttpTarget(new URL(location, url).toString(), { allowPrivate });
    }
    if (!response) throw new Error("No HTTP response");
    const latencyMs = Date.now() - started;
    const withCertificate = (result: CheckResult): CheckResult => ({ ...result, certExpiresAt: certificate.expiresAt });
    if (!isExpectedStatus(monitor.expectedStatusRange, response.status)) {
      const preview = monitor.saveErrorResponse ? await readResponsePreview(response).catch(() => null) : null;
      if (!monitor.saveErrorResponse) await response.body?.cancel();
      return withCertificate({ ...failure(started, `Expected ${monitor.expectedStatusRange}, received ${response.status}`, response.status), response: preview });
    }
    if (monitor.type === "KEYWORD" || monitor.keywordMatch || monitor.keywordAbsent) {
      const body = await limitedResponseText(response);
      if (monitor.keywordMatch && !body.includes(monitor.keywordMatch)) {
        return withCertificate({ ...failure(started, "Required keyword was not found", response.status), response: monitor.saveErrorResponse ? body.slice(0, RESPONSE_PREVIEW_BYTES).replaceAll("\0", "") : null });
      }
      if (monitor.keywordAbsent && body.includes(monitor.keywordAbsent)) {
        return withCertificate({ ...failure(started, "Forbidden keyword was found", response.status), response: monitor.saveErrorResponse ? body.slice(0, RESPONSE_PREVIEW_BYTES).replaceAll("\0", "") : null });
      }
    } else {
      await response.body?.cancel();
    }
    return withCertificate({ ok: true, latencyMs, statusCode: response.status, error: null });
  } catch (error) {
    // AbortSignal.timeout surfaces as a bare "The operation was aborted".
    const timedOut = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
    return failure(started, timedOut ? `Request timed out after ${monitor.timeoutMs} ms` : error instanceof Error ? error.message : "HTTP check failed");
  }
}

async function tcpCheck(monitor: MonitorCheckInput, allowPrivate: boolean): Promise<CheckResult> {
  const started = Date.now();
  try {
    const host = await validateNetworkHost(monitor.target, allowPrivate);
    if (!monitor.port || monitor.port < 1 || monitor.port > 65535) throw new Error("A valid TCP port is required");
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({ host, port: monitor.port!, lookup: guardedLookup(allowPrivate) });
      const timeout = setTimeout(() => socket.destroy(new Error("TCP check timed out")), monitor.timeoutMs);
      socket.once("connect", () => {
        clearTimeout(timeout);
        socket.end();
        resolve();
      });
      socket.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    return { ok: true, latencyMs: Date.now() - started, statusCode: null, error: null };
  } catch (error) {
    return failure(started, error instanceof Error ? error.message : "TCP check failed");
  }
}

async function tlsCheck(monitor: MonitorCheckInput, allowPrivate: boolean, defaultWarnDays: number): Promise<CheckResult> {
  const started = Date.now();
  try {
    const target = monitor.target.includes("://") ? new URL(monitor.target) : null;
    const host = await validateNetworkHost(target?.hostname ?? monitor.target, allowPrivate);
    const port = monitor.port ?? (target?.port ? Number(target.port) : 443);
    const certificate = await new Promise<tls.PeerCertificate>((resolve, reject) => {
      const socket = tls.connect({
        host,
        port,
        // Node refuses an IP address as the TLS server name.
        servername: net.isIP(host) ? undefined : host,
        rejectUnauthorized: monitor.verifyTls,
        lookup: guardedLookup(allowPrivate),
      });
      const timeout = setTimeout(() => socket.destroy(new Error("TLS check timed out")), monitor.timeoutMs);
      socket.once("secureConnect", () => {
        clearTimeout(timeout);
        const cert = socket.getPeerCertificate();
        socket.end();
        resolve(cert);
      });
      socket.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    const validUntil = Date.parse(certificate.valid_to);
    if (!Number.isFinite(validUntil)) throw new Error("Peer did not provide a valid certificate");
    const remainingDays = (validUntil - Date.now()) / 86_400_000;
    if (remainingDays <= (monitor.sslWarnDays ?? defaultWarnDays)) {
      return failure(started, `TLS certificate expires in ${Math.floor(remainingDays)} days`);
    }
    return { ok: true, latencyMs: Date.now() - started, statusCode: null, error: null };
  } catch (error) {
    return failure(started, error instanceof Error ? error.message : "TLS check failed");
  }
}

async function icmpCheck(monitor: MonitorCheckInput, allowPrivate: boolean): Promise<CheckResult> {
  const started = Date.now();
  try {
    if (!setting("monitorEnableIcmp")) {
      throw new Error("ICMP monitoring is disabled by the operator");
    }
    // ping resolves names itself, so hand it the already-checked address.
    const address = await pinnedAddress(await validateNetworkHost(monitor.target, allowPrivate), allowPrivate);
    await new Promise<void>((resolve, reject) => {
      const seconds = Math.max(1, Math.ceil(monitor.timeoutMs / 1000));
      const child = spawn("ping", ["-c", "1", "-W", String(seconds), address], {
        stdio: "ignore",
      });
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("ICMP check timed out"));
      }, monitor.timeoutMs + 500);
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new Error(`ping exited with status ${code}`));
      });
    });
    return { ok: true, latencyMs: Date.now() - started, statusCode: null, error: null };
  } catch (error) {
    return failure(started, error instanceof Error ? error.message : "ICMP check failed");
  }
}

async function dnsCheck(monitor: MonitorCheckInput): Promise<CheckResult> {
  const started = Date.now();
  try {
    const recordType = monitor.dnsRecordType ?? "A";
    let values: string[] = [];
    if (recordType === "A") values = await resolve4(monitor.target);
    if (recordType === "AAAA") values = await resolve6(monitor.target);
    if (recordType === "CNAME") values = await resolveCname(monitor.target);
    if (recordType === "NS") values = await resolveNs(monitor.target);
    if (recordType === "TXT") values = (await resolveTxt(monitor.target)).map((parts) => parts.join(""));
    if (recordType === "MX") values = (await resolveMx(monitor.target)).map((record) => `${record.priority} ${record.exchange}`);
    if (!values.length) throw new Error(`No ${recordType} records found`);
    if (monitor.dnsExpectedValue && !values.some((value) => value.includes(monitor.dnsExpectedValue!))) {
      throw new Error(`Expected DNS value was not found; received ${values.join(", ")}`);
    }
    return { ok: true, latencyMs: Date.now() - started, statusCode: null, error: null };
  } catch (error) {
    return failure(started, error instanceof Error ? error.message : "DNS check failed");
  }
}

export function heartbeatCheck(monitor: Pick<MonitorRow, "lastHeartbeatAt" | "createdAt" | "intervalSec" | "heartbeatGraceSec">): CheckResult {
  // A new monitor gets one full interval plus grace for its first heartbeat.
  const last = monitor.lastHeartbeatAt?.getTime() ?? 0;
  const reference = last || new Date(monitor.createdAt).getTime();
  const maximumAge = (monitor.intervalSec + (monitor.heartbeatGraceSec ?? 60)) * 1000;
  const age = Date.now() - reference;
  return age <= maximumAge
    ? { ok: true, latencyMs: null, statusCode: null, error: null }
    : {
        ok: false,
        latencyMs: null,
        statusCode: null,
        error: last ? `Heartbeat is ${Math.floor(age / 1000)} seconds old` : "No heartbeat received",
      };
}

/** `proxy` applies to HTTP and keyword checks only; the worker resolves it from the monitor's proxy_id. */
export async function runCheck(monitor: MonitorCheckInput, context: { proxy?: ProxyConfig | null; certWarnDays?: number } = {}) {
  const allowPrivate = setting("monitorAllowPrivateTargets");
  if (monitor.type === "HTTP" || monitor.type === "KEYWORD") return httpCheck(monitor, allowPrivate, context.proxy ?? null);
  if (monitor.type === "TCP") return tcpCheck(monitor, allowPrivate);
  if (monitor.type === "TLS" || monitor.type === "SSL") return tlsCheck(monitor, allowPrivate, context.certWarnDays ?? 14);
  if (monitor.type === "ICMP" || monitor.type === "PING") return icmpCheck(monitor, allowPrivate);
  if (monitor.type === "DNS") return dnsCheck(monitor);
  if (monitor.type === "HEARTBEAT") return heartbeatCheck(monitor);
  return {
    ok: false,
    latencyMs: null,
    statusCode: null,
    error: `Unsupported monitor type ${monitor.type}`,
  };
}

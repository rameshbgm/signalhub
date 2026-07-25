import net from "node:net";
import tls from "node:tls";
import { spawn } from "node:child_process";
import type { WithId } from "mongodb";
import type { MonitorDoc } from "@/lib/db";
import { validateHttpTarget, validateNetworkHost } from "@/lib/target-validation";
import { decryptSecret } from "@/lib/encryption";
import { resolve4, resolve6, resolveCname, resolveMx, resolveNs, resolveTxt } from "node:dns/promises";
import { isExpectedStatus } from "@/lib/monitor-validation";

export type CheckResult = {
  ok: boolean;
  latencyMs: number | null;
  statusCode: number | null;
  error: string | null;
};

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

async function limitedResponseText(response: Response) {
  const limit = Math.max(1_024, Number(process.env.MONITOR_MAX_RESPONSE_BYTES ?? 1_048_576));
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    await response.body?.cancel();
    throw new Error(`Response body exceeds the ${limit}-byte monitor limit`);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error(`Response body exceeds the ${limit}-byte monitor limit`);
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function httpCheck(monitor: WithId<MonitorDoc>, allowPrivate: boolean): Promise<CheckResult> {
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
    let response: Response | null = null;
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      response = await fetch(url, {
        method: monitor.method,
        headers,
        body: ["GET", "HEAD"].includes(monitor.method) ? undefined : monitor.requestBody ?? undefined,
        redirect: "manual",
        signal: AbortSignal.timeout(monitor.timeoutMs),
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("Too many or invalid redirects");
      url = await validateHttpTarget(new URL(location, url).toString(), { allowPrivate });
    }
    if (!response) throw new Error("No HTTP response");
    const latencyMs = Date.now() - started;
    if (!isExpectedStatus(monitor.expectedStatusRange, response.status)) {
      return failure(started, `Expected ${monitor.expectedStatusRange}, received ${response.status}`, response.status);
    }
    if (monitor.type === "KEYWORD" || monitor.keywordMatch || monitor.keywordAbsent) {
      const body = await limitedResponseText(response);
      if (monitor.keywordMatch && !body.includes(monitor.keywordMatch)) {
        return failure(started, "Required keyword was not found", response.status);
      }
      if (monitor.keywordAbsent && body.includes(monitor.keywordAbsent)) {
        return failure(started, "Forbidden keyword was found", response.status);
      }
    } else {
      await response.body?.cancel();
    }
    return { ok: true, latencyMs, statusCode: response.status, error: null };
  } catch (error) {
    return failure(started, error instanceof Error ? error.message : "HTTP check failed");
  }
}

async function tcpCheck(monitor: WithId<MonitorDoc>, allowPrivate: boolean): Promise<CheckResult> {
  const started = Date.now();
  try {
    const host = await validateNetworkHost(monitor.target, allowPrivate);
    if (!monitor.port || monitor.port < 1 || monitor.port > 65535) throw new Error("A valid TCP port is required");
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({ host, port: monitor.port! });
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

async function tlsCheck(monitor: WithId<MonitorDoc>, allowPrivate: boolean): Promise<CheckResult> {
  const started = Date.now();
  try {
    const target = monitor.target.includes("://") ? new URL(monitor.target) : null;
    const host = await validateNetworkHost(target?.hostname ?? monitor.target, allowPrivate);
    const port = monitor.port ?? (target?.port ? Number(target.port) : 443);
    const certificate = await new Promise<tls.PeerCertificate>((resolve, reject) => {
      const socket = tls.connect({
        host,
        port,
        servername: isNaN(Number(host)) ? host : undefined,
        rejectUnauthorized: monitor.verifyTls,
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
    if (remainingDays <= (monitor.sslWarnDays ?? 14)) {
      return failure(started, `TLS certificate expires in ${Math.floor(remainingDays)} days`);
    }
    return { ok: true, latencyMs: Date.now() - started, statusCode: null, error: null };
  } catch (error) {
    return failure(started, error instanceof Error ? error.message : "TLS check failed");
  }
}

async function icmpCheck(monitor: WithId<MonitorDoc>, allowPrivate: boolean): Promise<CheckResult> {
  const started = Date.now();
  try {
    if (process.env.MONITOR_ENABLE_ICMP !== "true") {
      throw new Error("ICMP monitoring is disabled by the operator");
    }
    const host = await validateNetworkHost(monitor.target, allowPrivate);
    await new Promise<void>((resolve, reject) => {
      const seconds = Math.max(1, Math.ceil(monitor.timeoutMs / 1000));
      const child = spawn("ping", ["-c", "1", "-W", String(seconds), host], {
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

async function dnsCheck(monitor: WithId<MonitorDoc>): Promise<CheckResult> {
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

function heartbeatCheck(monitor: WithId<MonitorDoc>): CheckResult {
  const last = monitor.lastHeartbeatAt?.getTime() ?? 0;
  const maximumAge = (monitor.intervalSec + (monitor.heartbeatGraceSec ?? 60)) * 1000;
  const age = Date.now() - last;
  return age <= maximumAge
    ? { ok: true, latencyMs: null, statusCode: null, error: null }
    : {
        ok: false,
        latencyMs: null,
        statusCode: null,
        error: last ? `Heartbeat is ${Math.floor(age / 1000)} seconds old` : "No heartbeat received",
      };
}

export async function runCheck(monitor: WithId<MonitorDoc>) {
  const allowPrivate = process.env.MONITOR_ALLOW_PRIVATE_TARGETS === "true";
  if (monitor.type === "HTTP" || monitor.type === "KEYWORD") return httpCheck(monitor, allowPrivate);
  if (monitor.type === "TCP") return tcpCheck(monitor, allowPrivate);
  if (monitor.type === "TLS" || monitor.type === "SSL") return tlsCheck(monitor, allowPrivate);
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

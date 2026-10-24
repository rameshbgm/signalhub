import { randomUUID } from "node:crypto";
import { encryptSecret } from "@/lib/encryption";
import { resolveAuthConfig } from "@/lib/monitor-auth";
import type { PreparedMonitorInput } from "@/lib/domain/monitors";
import type { MonitorRow } from "@/lib/postgres/schema";
import type { ProxyConfig } from "@/lib/proxy-tunnel";
import { applyUpsideDown, runCheck, type MonitorCheckInput } from "@/worker/checks";

export type MonitorTestResult = { ok: boolean; message: string; latencyMs: number | null; statusCode: number | null };

/** A single check: never writes monitor history, service status, incidents or notifications. */
export async function runMonitorTest(input: PreparedMonitorInput, options: {
  saved?: Pick<MonitorRow, "authType" | "authSecret" | "authConfigCiphertext">;
  proxy?: ProxyConfig | null;
  certWarnDays?: number;
} = {}): Promise<MonitorTestResult> {
  if (input.type === "HEARTBEAT") throw new Error("Save the monitor, then send a ping to its heartbeat URL to test it.");
  const saved = options.saved;
  const usesSecret = ["BASIC", "BEARER", "HEADER"].includes(input.authType);
  const monitor: MonitorCheckInput = {
    ...input,
    id: `test-${randomUUID()}`,
    authSecret: usesSecret ? input.authSecret ? encryptSecret(input.authSecret) : saved?.authType === input.authType ? saved.authSecret : null : null,
    authConfigCiphertext: resolveAuthConfig(input.authType, input.authConfig, saved?.authConfigCiphertext ?? null),
    cacheBuster: input.cacheBuster ?? false,
    ipFamily: input.ipFamily ?? "AUTO",
    upsideDown: input.upsideDown ?? false,
    // Never return a target's response body from a configuration test.
    saveErrorResponse: false,
    dnsRecordType: input.dnsRecordType ?? null,
    dnsExpectedValue: input.dnsExpectedValue ?? null,
    heartbeatGraceSec: input.heartbeatGraceSec ?? 60,
    lastHeartbeatAt: null,
    createdAt: new Date(),
  };
  const result = applyUpsideDown(await runCheck(monitor, options), monitor);
  return { ok: result.ok, message: result.ok ? "Test passed" : (result.error ?? "The check failed").slice(0, 300), latencyMs: result.latencyMs, statusCode: result.statusCode };
}

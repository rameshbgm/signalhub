import { headers } from "next/headers";
import { RuntimeSettingsEditor, type RuntimeSettingsView } from "@/components/platform/RuntimeSettingsEditor";
import { AbuseProtectionCard, type LimiterView } from "@/components/platform/AbuseProtectionCard";
import { PendingBanner } from "@/components/platform/PendingBanner";
import { ProxyTrustCard } from "@/components/platform/ProxyTrustCard";
import { RestoreButton } from "@/components/platform/RestoreButton";
import { ResetRuntimeSettingsButton } from "@/components/platform/ResetRuntimeSettingsButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { ConfigurationHeader } from "@/components/platform/SectionHeaders";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { database } from "@/lib/postgres/client";
import { inspectMigrationState } from "@/lib/migrations";
import packageJson from "@/package.json";
import { requirePlatformPageCapability } from "@/lib/platform-page-guard";
import { hasPlatformCapability } from "@/lib/platform-policy";
import { effectiveProxyTrust } from "@/lib/proxy-trust";
import { loadProxyTrust } from "@/lib/proxy-trust-store";
import { LIMITERS, limiterEnvName, presetRateLimits, resolveLimit } from "@/lib/rate-limit-policy";
import { safeMode } from "@/lib/settings/effective";
import { expireDuePending, readPending } from "@/lib/settings/pending";
import { securityPosture } from "@/lib/settings/posture";
import { buildProxyTrustView } from "@/lib/settings/proxy-view";
import { SETTINGS } from "@/lib/settings/registry";
import { currentConfiguration, requestEvidence } from "@/lib/settings/review";
import { loadSettings } from "@/lib/settings/store";

// Settings change while the server runs: never serve this from a build-time or cached render.
export const dynamic = "force-dynamic";

const HISTORY_ACTIONS = ["DEPLOYMENT_SETTINGS_UPDATED", "PROXY_TRUST_UPDATED", "SETTINGS_REVERTED", "SETTINGS_CONFIRMED"];
const ENV_ONLY = [
  ["DATABASE_URL", "Database connection"],
  ["SESSION_SECRET", "Session signing secret"],
  ["ENCRYPTION_KEY", "Encryption key"],
  ["METRICS_TOKEN", "Metrics access token"],
  ["OTEL_EXPORTER_OTLP_ENDPOINT", "Telemetry export"],
] as const;

const show = (value: unknown) =>
  Array.isArray(value) ? (value.length ? value.join(", ") : "none") : value === null || value === "" ? "not set" : typeof value === "boolean" ? (value ? "on" : "off") : String(value);

export default async function DeploymentPage() {
  const actor = await requirePlatformPageCapability("configuration.read");
  const canManage = hasPlatformCapability(actor.role, "configuration.manage");
  await expireDuePending().catch(() => undefined); // an unconfirmed change reverts before the page is drawn
  await Promise.all([loadSettings(), loadProxyTrust()]);

  const requestHeaders = await headers();
  const current = currentConfiguration();
  const trust = effectiveProxyTrust();
  const evidence = requestEvidence(requestHeaders, trust);
  const local = !evidence.host || /^(localhost|127\.|\[::1\])/.test(evidence.host);
  const detectedUrl = !local && evidence.host ? `${evidence.scheme ?? "https"}://${evidence.host}` : null;
  const pending = await readPending();
  const [migration, worker] = await Promise.all([
    inspectMigrationState(),
    database.selectFrom("workerHeartbeats").select(["status", "lastSeenAt", "version"]).orderBy("lastSeenAt", "desc").limit(1).executeTakeFirst(),
  ]);
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const workerHealthy = worker?.status === "READY" && now - worker.lastSeenAt.getTime() < 30_000;

  const view: RuntimeSettingsView = {
    canManage,
    current: { proxy: current.proxy, settings: current.settings, sources: current.sources, invalid: current.invalid, proxyLocked: current.proxyLocks.mode || current.proxyLocks.hops || current.proxyLocks.cidrs },
    definitions: SETTINGS as unknown as RuntimeSettingsView["definitions"],
    detectedUrl,
  };

  const limiters: LimiterView[] = LIMITERS.map((limiter) => {
    const resolved = resolveLimit(limiter.id);
    return { ...limiter, envName: limiterEnvName(limiter.id), current: { limit: resolved.limit, windowSeconds: resolved.windowMs / 1000, source: resolved.source, invalid: resolved.invalid } };
  });

  const posture = securityPosture({
    settings: current.settings,
    proxy: current.proxy,
    scheme: evidence.scheme,
    behindProxy: evidence.diagnosis?.behindProxy ?? "unknown",
    loosenedLimits: limiters.filter((limiter) => limiter.current.source !== "default" && limiter.current.limit > limiter.limit).length,
  });

  const history = await database
    .selectFrom("platformAuditLogs")
    .select(["id", "action", "actorEmail", "reason", "createdAt", "metadata"])
    .where("action", "in", HISTORY_ACTIONS)
    .orderBy("createdAt", "desc")
    .limit(15)
    .execute();

  return (
    <div className="space-y-6">
      <ConfigurationHeader active="runtime" />

      {pending && <PendingBanner revertAt={pending.revertAt} keys={pending.keys} canManage={canManage} />}
      {safeMode() && <Alert tone="warn" title="Safe mode is on">SIGNALHUB_SAFE_MODE ignores the values saved here and uses the defaults and the environment. Remove it to use your saved settings again.</Alert>}
      {Object.entries(current.invalid).map(([key, message]) => (
        <Alert key={key} tone="warn" title={`Using the default for ${SETTINGS.find((definition) => definition.key === key)?.label ?? key}`}>{message}</Alert>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>System health</CardTitle>
          <CardDescription>SignalHub {packageJson.version}{current.settings.publicUrl ? ` · ${current.settings.publicUrl}` : ""}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 sm:grid-cols-3">
            <HealthItem title="Database" value="Connected" detail="PostgreSQL is responding to this page." healthy />
            <HealthItem title="Database schema" value={migration.current ? "Current" : "Update needed"} detail={`${migration.verifiedCount} of ${migration.expectedCount} migrations verified.`} healthy={migration.current} />
            <HealthItem title="Background worker" value={workerHealthy ? "Running" : "Not reporting"} detail={worker?.lastSeenAt ? `Last report ${worker.lastSeenAt.toLocaleString()}.` : "The worker runs monitors and sends notifications."} healthy={workerHealthy} />
          </ul>
        </CardContent>
      </Card>

      <details className="rounded-card border border-line bg-surface p-5">
        <summary className="cursor-pointer text-sm font-semibold text-ink">Security checklist · {posture.score}% passing</summary>
        <p className="mt-2 text-sm text-ink-soft">Advice only. These checks show how the current settings affect your installation.</p>
        <div className="mt-4">
          <ul className="grid gap-3 md:grid-cols-2">
            {posture.items.map((item) => (
              <li key={item.id} className="flex items-start gap-3 rounded-control border border-line p-3">
                {item.status === "ok" ? <CheckCircle2 aria-label="Good" size={18} className="mt-0.5 shrink-0 text-ok" /> : item.status === "warn" ? <AlertTriangle aria-label="Needs attention" size={18} className="mt-0.5 shrink-0 text-warn" /> : <Info aria-label="Worth a look" size={18} className="mt-0.5 shrink-0 text-info" />}
                <div className="min-w-0"><p className="text-sm font-medium text-ink">{item.title}</p><p className="break-words text-xs leading-5 text-ink-soft">{item.detail}</p></div>
              </li>
            ))}
          </ul>
        </div>
      </details>

      <RuntimeSettingsEditor view={view} />

      <details className="rounded-card border border-line bg-surface p-5">
        <summary className="cursor-pointer text-sm font-semibold text-ink">Network and abuse protection</summary>
        <p className="mt-2 text-sm text-ink-soft">Proxy trust and rate limits for this installation.</p>
        <div className="mt-4 space-y-6">
          <ProxyTrustCard view={buildProxyTrustView(requestHeaders, canManage)} />
          <AbuseProtectionCard
            canManage={canManage}
            limiters={limiters}
            presets={{ standard: {}, relaxed: presetRateLimits("relaxed"), strict: presetRateLimits("strict") }}
          />
        </div>
      </details>

      <details className="group rounded-card border border-line bg-surface p-5">
        <summary className="cursor-pointer text-sm font-semibold text-ink">Settings in force</summary>
        <p className="mt-2 text-sm text-ink-soft">Values currently used and where each one comes from.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-ink-dim"><tr><th className="py-2 pr-4">Setting</th><th className="py-2 pr-4">Value</th><th className="py-2">Source</th></tr></thead>
            <tbody className="divide-y divide-line">
              {SETTINGS.map((definition) => (
                <tr key={definition.key}>
                  <td className="py-2 pr-4 font-medium text-ink">{definition.label}</td>
                  <td className="break-words py-2 pr-4 font-mono text-[0.8125rem] text-ink-soft">{show(current.settings[definition.key])}</td>
                  <td className="py-2"><StatusBadge tone={current.sources[definition.key] === "environment" ? "info" : "neutral"}>{current.sources[definition.key] === "environment" ? `Environment (${("env" in definition && definition.env) || ""})` : current.sources[definition.key] === "admin" ? "Saved here" : "Default"}</StatusBadge></td>
                </tr>
              ))}
              {ENV_ONLY.map(([name, label]) => (
                <tr key={name}>
                  <td className="py-2 pr-4 font-medium text-ink">{label}</td>
                  <td className="py-2 pr-4 font-mono text-[0.8125rem] text-ink-soft">{process.env[name] ? "set" : "not set"}</td>
                  <td className="py-2"><StatusBadge tone="neutral">Environment only ({name})</StatusBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <details className="group rounded-card border border-line bg-surface p-5">
        <summary className="cursor-pointer text-sm font-semibold text-ink">Change history</summary>
        <p className="mt-2 text-sm text-ink-soft">Recent changes to runtime settings.</p>
        <div className="mt-4 space-y-4">
          {canManage && <ResetRuntimeSettingsButton />}
          {history.length === 0 ? <p className="text-sm text-ink-soft">No changes yet.</p> : (
            <ul className="divide-y divide-line">
              {history.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-ink">{entry.reason ?? entry.action}</p>
                    <p className="text-xs text-ink-dim">{entry.createdAt.toLocaleString()} · {entry.actorEmail}</p>
                  </div>
                  {canManage && Boolean((entry.metadata as { from?: unknown } | null)?.from) && ["DEPLOYMENT_SETTINGS_UPDATED", "PROXY_TRUST_UPDATED"].includes(entry.action) && <RestoreButton auditId={entry.id} />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
}

function HealthItem({ title, value, detail, healthy }: { title: string; value: string; detail: string; healthy: boolean }) {
  return (
    <li className="flex flex-col gap-2 rounded-control border border-line p-4">
      <span className="text-sm font-medium text-ink">{title}</span>
      <StatusBadge tone={healthy ? "ok" : "warn"}>{value}</StatusBadge>
      <span className="text-xs leading-5 text-ink-soft">{detail}</span>
    </li>
  );
}

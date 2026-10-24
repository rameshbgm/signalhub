import { domainEligibility, monitorHostname } from "@/lib/domain-name";
import { expiryAlert, expiryPhrase } from "@/lib/expiry";
import { errorFields, log } from "@/lib/logger";
import { effectiveMonitoringSettings } from "@/lib/monitoring-settings";
import { dispatchNotifications } from "@/lib/notify";
import { database } from "@/lib/postgres/client";
import type { MonitorRow } from "@/lib/postgres/schema";
import { lookupDomainExpiry } from "@/lib/rdap";
import type { CheckResult } from "@/worker/checks";

const DOMAIN_RECHECK_MS = 24 * 3_600_000;
/** After a failed registry lookup, try again in an hour rather than waiting a full day. */
const DOMAIN_RETRY_MS = 3_600_000;

type Context = { monitor: MonitorRow; workerId: string; organizationId: string; now: Date };

function warn(kind: "cert" | "domain", { monitor }: Context, subject: string, body: string, expiresAt: Date) {
  return dispatchNotifications({
    pageId: monitor.pageId,
    subject,
    body,
    eventType: kind === "cert" ? "monitor.cert_expiring" : "monitor.domain_expiring",
    // One warning per expiry date: a renewed certificate or domain has a new date and warns again later.
    eventId: `${monitor.id}:${kind}:${expiresAt.toISOString()}`,
    correlationId: `monitor:${monitor.id}`,
    componentIds: monitor.componentId ? [monitor.componentId] : [],
    // Operational detail, not a status update: webhooks and destinations only, never page subscribers.
    audience: "operators",
  });
}

async function certificateExpiry(context: Context, expiresAt: Date, warnDays: number) {
  const { monitor, workerId, now } = context;
  const alert = expiryAlert({ expiresAt, warnDays, notifiedFor: monitor.certNotifiedFor, now });
  if (alert.notify) {
    const host = monitorHostname(monitor.type, monitor.target) ?? monitor.target;
    await warn("cert", context, `[Certificate ${alert.daysLeft < 0 ? "expired" : "expiring"}] ${monitor.name}`,
      `The TLS certificate for ${host} ${expiryPhrase(alert.daysLeft)} (${expiresAt.toUTCString()}).`, expiresAt);
  }
  await database.updateTable("monitors")
    .set({ certExpiresAt: expiresAt, ...(alert.notify ? { certNotifiedFor: expiresAt } : {}) })
    .where("id", "=", monitor.id).where("leaseOwner", "=", workerId).execute();
}

async function domainExpiry(context: Context, warnDays: number) {
  const { monitor, workerId, now } = context;
  const host = monitorHostname(monitor.type, monitor.target);
  let found: Awaited<ReturnType<typeof lookupDomainExpiry>> = null;
  let lookupFailed = false;
  if (domainEligibility(host).ok) {
    try {
      found = await lookupDomainExpiry(host!);
    } catch (error) {
      lookupFailed = true;
      log("warn", "Domain expiry lookup failed", { monitorId: monitor.id, host, ...errorFields(error) });
    }
  }
  const alert = found ? expiryAlert({ expiresAt: found.expiresAt, warnDays, notifiedFor: monitor.domainNotifiedFor, now }) : null;
  if (found && alert?.notify) {
    await warn("domain", context, `[Domain ${alert.daysLeft < 0 ? "expired" : "expiring"}] ${monitor.name}`,
      `The domain ${found.domain} ${expiryPhrase(alert.daysLeft)} (${found.expiresAt.toUTCString()}).`, found.expiresAt);
  }
  await database.updateTable("monitors")
    .set({
      domainCheckedAt: lookupFailed ? new Date(now.getTime() - DOMAIN_RECHECK_MS + DOMAIN_RETRY_MS) : now,
      ...(found ? { domainExpiresAt: found.expiresAt } : {}),
      ...(found && alert?.notify ? { domainNotifiedFor: found.expiresAt } : {}),
    })
    .where("id", "=", monitor.id).where("leaseOwner", "=", workerId).execute();
}

/**
 * Certificate and domain expiry warnings, run after a check. The certificate comes
 * from the check itself; the domain is looked up at most once a day. Failures here are
 * logged and never affect the monitor's up/down state.
 */
export async function processExpiry(monitor: MonitorRow, result: CheckResult, organizationId: string, workerId: string, now: Date) {
  const certDate = monitor.certExpiryNotify ? result.certExpiresAt ?? null : null;
  const domainDue = monitor.domainExpiryNotify && (!monitor.domainCheckedAt || now.getTime() - monitor.domainCheckedAt.getTime() >= DOMAIN_RECHECK_MS);
  if (!certDate && !domainDue) return;
  const context = { monitor, workerId, organizationId, now };
  try {
    const settings = await effectiveMonitoringSettings(organizationId);
    if (certDate) await certificateExpiry(context, certDate, monitor.sslWarnDays ?? settings.certExpiryWarnDays);
    if (domainDue) await domainExpiry(context, settings.domainExpiryWarnDays);
  } catch (error) {
    log("error", "Expiry processing failed", { monitorId: monitor.id, ...errorFields(error) });
  }
}

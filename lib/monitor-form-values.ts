import type { MonitorFormValues } from "@/components/admin/MonitorForm";
import { authConfigView } from "@/lib/monitor-auth";
import type { MonitorRow } from "@/lib/postgres/schema";

/** Only the fields the edit form needs; stored secrets and token hashes stay on the server. */
export function monitorFormValues(m: MonitorRow): MonitorFormValues {
  return {
    id: m.id, name: m.name, type: m.type, target: m.target, port: m.port, componentId: m.componentId,
    method: m.method, expectedStatusRange: m.expectedStatusRange, timeoutMs: m.timeoutMs,
    requestHeaders: m.requestHeaders, requestBody: m.requestBody, keywordMatch: m.keywordMatch,
    keywordAbsent: m.keywordAbsent, sslWarnDays: m.sslWarnDays, dnsRecordType: m.dnsRecordType,
    dnsExpectedValue: m.dnsExpectedValue, heartbeatGraceSec: m.heartbeatGraceSec, verifyTls: m.verifyTls, cacheBuster: m.cacheBuster, saveErrorResponse: m.saveErrorResponse, certExpiryNotify: m.certExpiryNotify, domainExpiryNotify: m.domainExpiryNotify, proxyId: m.proxyId, ipFamily: m.ipFamily, upsideDown: m.upsideDown,
    authType: m.authType, authUsername: m.authUsername, authHeaderName: m.authHeaderName,
    intervalSec: m.intervalSec, failThreshold: m.failThreshold, recoverThreshold: m.recoverThreshold,
    downStatus: m.downStatus, groupName: m.groupName, tags: m.tags ?? [],
    actionFlipStatus: m.actionFlipStatus, actionRecordMetric: m.actionRecordMetric,
    actionAutoIncident: m.actionAutoIncident, actionNotify: m.actionNotify,
    hasAuthSecret: Boolean(m.authSecret),
    authView: authConfigView(m.authConfigCiphertext),
  };
}

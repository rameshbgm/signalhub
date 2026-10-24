import { diagnoseProxy, effectiveProxyTrust, MAX_PROXY_HOPS, parseCidrs, peerIsTrusted, PEER_HEADER, resolveClientIp, type ProxyTrustMode, type ProxyTrustSettings } from "@/lib/proxy-trust";
import { effectiveSetting, type SettingSource, type StoredSettings, storedSettings } from "@/lib/settings/effective";
import { requestScheme } from "@/lib/settings/request";
import { SETTINGS, settingDefinition, type SettingKey, type SettingValues } from "@/lib/settings/registry";
import { validateConfiguration, type Finding } from "@/lib/settings/validate";

/**
 * What a proposed configuration means, without saving anything: what is locked by
 * the environment, what would change, what looks wrong. Used by the Deployment
 * page and by the setup wizard's "Next" step.
 */
type Env = Record<string, string | undefined>;
type Trust = ReturnType<typeof effectiveProxyTrust>;
export type ProxyConfiguration = { mode: ProxyTrustMode; hops: number; cidrs: string[] };
export type RequestEvidence = { diagnosis: ReturnType<typeof diagnoseProxy>; host: string | null; scheme: "https" | "http" | null };
export type SettingChange = { id: string; label: string; from: string; to: string };

export type CurrentConfiguration = {
  proxy: ProxyConfiguration;
  settings: SettingValues;
  stored: StoredSettings;
  sources: Record<SettingKey, SettingSource>;
  invalid: Partial<Record<SettingKey, string>>;
  proxyLocks: { mode: boolean; hops: boolean; cidrs: boolean };
  proxyInvalid: string[];
};

export function currentConfiguration(env: Env = process.env, stored: StoredSettings = storedSettings(), trust: Trust = effectiveProxyTrust(env)): CurrentConfiguration {
  const settings: Record<string, unknown> = {};
  const sources: Record<string, SettingSource> = {};
  const invalid: Record<string, string> = {};
  for (const definition of SETTINGS) {
    const result = effectiveSetting(definition.key, env, stored);
    settings[definition.key] = result.value;
    sources[definition.key] = result.source;
    if (result.invalid) invalid[definition.key] = result.invalid;
  }
  return {
    proxy: { mode: trust.mode, hops: trust.hops, cidrs: [...trust.cidrs] },
    settings: settings as SettingValues,
    stored,
    sources: sources as Record<SettingKey, SettingSource>,
    invalid,
    proxyLocks: { mode: trust.modeSource === "environment", hops: trust.hopsSource === "environment", cidrs: trust.cidrsSource === "environment" },
    proxyInvalid: [...trust.cidrsInvalid],
  };
}

export type ProposalInput = {
  proxy: ProxyConfiguration;
  /** Explicit values the administrator set. */
  settings: Partial<Record<SettingKey, unknown>>;
  /** Settings to put back to their default (the saved value is deleted). */
  reset: SettingKey[];
};

export type ResolvedProposal = {
  proxy: ProxyConfiguration;
  /** Every setting as it would be after the change (raw values, so invalid ones can be reported). */
  effective: Partial<Record<SettingKey, unknown>> & SettingValues;
  /** Saved-value changes; undefined means delete. */
  storeChanges: Partial<Record<SettingKey, unknown>>;
  changedKeys: SettingKey[];
  proxyChanged: boolean;
  ignoredLocked: string[];
  findings: Finding[];
};

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

export function resolveProposal(current: CurrentConfiguration, input: ProposalInput): ResolvedProposal {
  const findings: Finding[] = [];
  const ignoredLocked: string[] = [];

  const { cidrs, invalid } = parseCidrs(input.proxy.cidrs ?? []);
  if (invalid.length) findings.push({ id: "proxy.cidrs-invalid", severity: "error", setting: "proxy", title: "Some trusted ranges are not valid", why: `Not network ranges: ${invalid.join(", ")}. Use CIDR notation such as 10.0.0.0/8.` });
  if (!Number.isInteger(input.proxy.hops) || input.proxy.hops < 1 || input.proxy.hops > MAX_PROXY_HOPS) {
    findings.push({ id: "proxy.hops-range", severity: "error", setting: "proxy", title: "The number of proxies is out of range", why: `Use a whole number from 1 to ${MAX_PROXY_HOPS}.` });
  }
  const proxy: ProxyConfiguration = {
    mode: current.proxyLocks.mode ? current.proxy.mode : input.proxy.mode,
    hops: current.proxyLocks.hops || findings.some((finding) => finding.id === "proxy.hops-range") ? current.proxy.hops : input.proxy.hops,
    cidrs: current.proxyLocks.cidrs || invalid.length ? current.proxy.cidrs : cidrs,
  };
  const proxyChanged = proxy.mode !== current.proxy.mode || proxy.hops !== current.proxy.hops || !same(proxy.cidrs, current.proxy.cidrs);

  const storeChanges: Partial<Record<SettingKey, unknown>> = {};
  const effective: Record<string, unknown> = { ...current.settings };
  for (const key of input.reset) {
    if (current.sources[key] === "environment") { ignoredLocked.push(key); continue; }
    effective[key] = settingDefinition(key).default;
    if (current.stored[key] !== undefined) storeChanges[key] = undefined;
  }
  for (const [key, value] of Object.entries(input.settings) as [SettingKey, unknown][]) {
    if (value === undefined) continue;
    if (current.sources[key] === "environment") { ignoredLocked.push(key); continue; }
    effective[key] = value;
    const inForce = current.stored[key] === undefined && same(value, current.settings[key]);
    if (!inForce && !same(value, current.stored[key])) storeChanges[key] = value;
  }
  return {
    proxy, effective: effective as ResolvedProposal["effective"], storeChanges,
    changedKeys: Object.keys(storeChanges) as SettingKey[], proxyChanged, ignoredLocked, findings,
  };
}

/** A change that could cut the administrator off is applied provisionally and reverted unless confirmed. */
export function requiresConfirmation(changedKeys: readonly string[], proxyChanged: boolean) {
  return proxyChanged || changedKeys.some((key) => (settingDefinition(key as SettingKey) as { lockout?: boolean }).lockout === true);
}

const hostOf = (headers: Headers, trust: ProxyTrustSettings) => {
  const peer = headers.get(PEER_HEADER)?.trim() || null;
  const forwarded = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  return (peerIsTrusted(peer, trust) && forwarded) || headers.get("host") || null;
};

/** What the server can see about the network path of one request. */
export function requestEvidence(headers: Headers, trust: ProxyTrustSettings): RequestEvidence {
  return { diagnosis: diagnoseProxy(headers, trust), host: hostOf(headers, trust), scheme: requestScheme(headers, undefined, trust) };
}

export type Review = {
  findings: Finding[];
  /** An error in something being changed: cannot be applied. */
  blocking: boolean;
  /** Ids of warnings in things being changed: the administrator must accept them. */
  warningIds: string[];
  changes: SettingChange[];
  needsConfirmation: boolean;
  ignoredLocked: string[];
  resolved: ResolvedProposal;
};

function display(value: unknown, empty: string) {
  if (Array.isArray(value)) return value.length ? value.join(", ") : empty;
  if (value === null || value === undefined || value === "") return "not set";
  if (typeof value === "boolean") return value ? "on" : "off";
  return String(value);
}

function proposalChanges(resolved: ResolvedProposal, current: CurrentConfiguration): SettingChange[] {
  const changes: SettingChange[] = [];
  const add = (id: string, label: string, before: unknown, after: unknown, empty: string) => {
    const from = display(before, empty);
    const to = display(after, empty);
    if (from !== to) changes.push({ id, label, from, to });
  };
  add("proxy.mode", "Proxy trust", current.proxy.mode, resolved.proxy.mode, "not set");
  add("proxy.hops", "Proxies in front", current.proxy.hops, resolved.proxy.hops, "not set");
  add("proxy.cidrs", "Trusted proxy ranges", current.proxy.cidrs, resolved.proxy.cidrs, "any private address");
  for (const key of resolved.changedKeys) {
    const definition = settingDefinition(key);
    add(key, definition.label, current.settings[key], resolved.effective[key], key === "adminCidrs" ? "any network" : "not set");
  }
  return changes;
}

export function buildReview(headers: Headers, input: ProposalInput, current: CurrentConfiguration = currentConfiguration()): Review {
  const resolved = resolveProposal(current, input);
  const trust: ProxyTrustSettings = resolved.proxy;
  const evidence = requestEvidence(headers, trust);
  const ownAddress = resolveClientIp(headers, trust);
  const findings = [
    ...resolved.findings,
    ...validateConfiguration(
      { proxy: resolved.proxy, settings: resolved.effective },
      { diagnosis: evidence.diagnosis, host: evidence.host, scheme: evidence.scheme, ownAddress },
    ),
  ];
  const changed = new Set<string>(resolved.changedKeys);
  const relevant = (finding: Finding) => {
    if (finding.id.startsWith("proxy.cidrs-") || finding.id === "proxy.hops-range") return true;
    if (finding.setting === "proxy") return resolved.proxyChanged;
    if (finding.id === "admin.excludes-you") return resolved.proxyChanged || changed.has("adminCidrs");
    return changed.has(finding.setting);
  };
  const relevantFindings = findings.filter(relevant);
  return {
    findings,
    blocking: relevantFindings.some((finding) => finding.severity === "error"),
    warningIds: relevantFindings.filter((finding) => finding.severity === "warning").map((finding) => finding.id),
    changes: proposalChanges(resolved, current),
    needsConfirmation: requiresConfirmation(resolved.changedKeys, resolved.proxyChanged),
    ignoredLocked: resolved.ignoredLocked,
    resolved,
  };
}

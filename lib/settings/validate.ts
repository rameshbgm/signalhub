import { isIP } from "node:net";
import { addressAllowed } from "@/lib/network-policy";
import { peerKind, type ProxyDiagnosis, type ProxyTrustMode } from "@/lib/proxy-trust";
import { parseValue, settingDefinition, type SettingKey, type SettingValues } from "@/lib/settings/registry";

/**
 * Checks a proposed configuration against what we can see of how the server is
 * actually being reached, and explains anything that looks wrong.
 *
 *  - error:   the value is invalid or would lock the administrator out. Blocks saving.
 *  - warning: probably a mistake. The operator can accept it and continue.
 *  - info:    advice.
 *
 * Findings never throw and never stop the app from working: a configuration the
 * operator insists on is applied, and the checks are shown again on the page.
 */
export type ProxyProposal = { mode: ProxyTrustMode; hops: number; cidrs?: readonly string[] };
export type Proposal = { proxy: ProxyProposal; settings: Partial<Record<SettingKey, unknown>> };
export type ValidationContext = {
  /** Diagnosis of the current request, computed under the proposed proxy settings. */
  diagnosis: ProxyDiagnosis | null;
  /** Host and scheme the operator is using to reach this page. */
  host: string | null;
  scheme: "https" | "http" | null;
  ownAddress: string;
};
export type Severity = "error" | "warning" | "info";
export type Finding = {
  id: string;
  severity: Severity;
  /** The setting (or "proxy") the finding is about. */
  setting: string;
  title: string;
  why: string;
  fix?: { label: string; proxy?: Partial<ProxyProposal>; settings?: Partial<SettingValues> };
};

const ORDER: Severity[] = ["error", "warning", "info"];
const hostName = (host: string) => host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "").toLowerCase();
const isLocalOrIp = (host: string | null) => !host || /^(localhost|127\.)/.test(host) || host.startsWith("[::1]") || isIP(hostName(host)) !== 0;
const isLocal = (host: string | null) => !host || /^(localhost|127\.)/.test(host) || host.startsWith("[::1]");

export function validateConfiguration(proposal: Proposal, context: ValidationContext): Finding[] {
  const findings: Finding[] = [];
  const add = (finding: Finding) => findings.push(finding);
  const { diagnosis, host, scheme, ownAddress } = context;
  const { proxy } = proposal;

  // Values that cannot be used at all.
  const valid: Partial<SettingValues> = {};
  for (const [key, value] of Object.entries(proposal.settings)) {
    if (value === undefined) continue;
    const definition = settingDefinition(key as SettingKey);
    const parsed = parseValue(definition, value);
    if (parsed.ok) (valid as Record<string, unknown>)[key] = parsed.value;
    else add({ id: `value.invalid.${key}`, severity: "error", setting: key, title: `${definition.label} is not valid`, why: parsed.error });
  }
  const publicUrl = valid.publicUrl ?? null;
  const httpsAddress = publicUrl?.startsWith("https://") ?? false;

  if (diagnosis) {
    const cidrs = proxy.cidrs ?? [];
    if (proxy.mode === "on" && !cidrs.length && diagnosis.behindProxy === "no") {
      add({
        id: "proxy.on-without-proxy", severity: "warning", setting: "proxy",
        title: "Forwarded addresses are always trusted, but nothing seems to proxy this server",
        why: "Anyone who can reach the server directly can send their own X-Forwarded-For and be believed, which defeats login rate limits and IP allowlists. Use Auto, or add your proxy's network range.",
        fix: { label: "Use Auto", proxy: { mode: "auto" } },
      });
    }
    if (proxy.mode === "off" && diagnosis.behindProxy === "yes") {
      add({
        id: "proxy.off-behind-proxy", severity: "warning", setting: "proxy",
        title: "A proxy is in front of this server, but forwarded addresses are ignored",
        why: "Every visitor will look like the proxy, so they share one rate-limit allowance, IP allowlists cannot work and audit logs lose the real address.",
        fix: { label: "Use Auto", proxy: { mode: "auto" } },
      });
    }
    if (proxy.mode !== "off" && cidrs.length && diagnosis.proxyHeaderPresent && diagnosis.peerTrusted === false) {
      add({
        id: "proxy.range-excludes-proxy", severity: "error", setting: "proxy",
        title: "The trusted ranges leave out the proxy you are connected through",
        why: `Your connection comes through ${diagnosis.peer ?? "a proxy"}, which is outside ${cidrs.join(", ")}. Every visitor would look like that proxy.`,
        fix: diagnosis.suggestedCidr ? { label: `Trust ${diagnosis.suggestedCidr}`, proxy: { cidrs: [diagnosis.suggestedCidr] } } : { label: "Trust any private address", proxy: { cidrs: [] } },
      });
    }
    if (proxy.mode !== "off" && diagnosis.behindProxy === "yes" && proxy.hops !== diagnosis.suggestedHops) {
      add({
        id: "proxy.hops-differ", severity: "warning", setting: "proxy",
        title: `You set ${proxy.hops} proxies in front, but this request passed through ${diagnosis.suggestedHops}`,
        why: "The visitor's address is read from the right-hand end of X-Forwarded-For, counted in proxies. A wrong count reads the wrong entry.",
        fix: { label: `Use ${diagnosis.suggestedHops}`, proxy: { hops: diagnosis.suggestedHops } },
      });
    }
    const visitor = diagnosis.clientIpByMode[proxy.mode];
    if (proxy.mode !== "off" && diagnosis.behindProxy === "yes" && (peerKind(visitor) === "private" || peerKind(visitor) === "loopback")) {
      add({
        id: "proxy.visitor-private", severity: "warning", setting: "proxy",
        title: "The visitor address behind the proxy is a private address",
        why: `The forwarded address (${visitor}) is private. If you expect public visitors, a load balancer or Kubernetes service in front is rewriting their address (use externalTrafficPolicy: Local or PROXY protocol). If you are testing from inside your network, this is expected.`,
      });
    }
  }

  if (publicUrl) {
    const url = new URL(publicUrl);
    if (url.protocol === "http:" && scheme === "https") {
      add({
        id: "url.scheme-mismatch", severity: "warning", setting: "publicUrl",
        title: "The public address uses http, but you are reaching this page over https",
        why: "Links in emails and single sign-on callbacks would point at the insecure address.",
        fix: { label: "Use https", settings: { publicUrl: publicUrl.replace(/^http:/, "https:") } },
      });
    }
    if (host && !isLocalOrIp(host) && url.host.toLowerCase() !== host.toLowerCase()) {
      add({
        id: "url.host-mismatch", severity: "warning", setting: "publicUrl",
        title: "The public address is not the address you are using right now",
        why: `You reached this page at ${host}, but the public address is ${url.host}. Links we send would lead somewhere else. If a proxy maps one to the other this is fine.`,
        fix: { label: `Use ${scheme ?? url.protocol.replace(":", "")}://${host}`, settings: { publicUrl: `${scheme ?? url.protocol.replace(":", "")}://${host}` } },
      });
    }
  }

  const effectiveHttps = publicUrl ? httpsAddress : scheme === "https";
  if (valid.secureCookies === "always" && !effectiveHttps && !isLocal(host)) {
    add({
      id: "https.secure-needs-https", severity: "error", setting: "secureCookies",
      title: "Secure cookies need HTTPS, and this site is not being served over HTTPS",
      why: "Browsers drop Secure cookies on plain HTTP, so nobody could stay signed in, including you.",
      fix: { label: "Use Auto", settings: { secureCookies: "auto" } },
    });
  }
  if (valid.hsts === "on" && publicUrl && !httpsAddress) {
    add({
      id: "hsts.needs-https", severity: "warning", setting: "hsts",
      title: "HSTS is never sent while the public address is http",
      why: "Browsers ignore it over plain HTTP, so this setting has no effect until the public address is https.",
    });
  }
  if (!httpsAddress && scheme === "http" && !isLocal(host)) {
    add({
      id: "https.unencrypted", severity: "info", setting: "publicUrl",
      title: "This site is reached over plain HTTP",
      why: "Sign-ins and session cookies travel unencrypted. Put it behind HTTPS (a reverse proxy or your platform's load balancer) before real use.",
    });
  }

  const admin = valid.adminCidrs;
  if (admin?.length && isIP(ownAddress) && !addressAllowed(ownAddress, admin)) {
    add({
      id: "admin.excludes-you", severity: "error", setting: "adminCidrs",
      title: "These networks do not include your own address",
      why: `You are connecting from ${ownAddress}. Saving this would lock you out of Platform administration.`,
      fix: { label: `Allow ${ownAddress}`, settings: { adminCidrs: [`${ownAddress}/${isIP(ownAddress) === 4 ? 32 : 128}`] } },
    });
  }

  const idle = valid.sessionIdleSeconds;
  const absolute = valid.sessionAbsoluteSeconds;
  if ((idle ?? absolute) !== undefined) {
    const effectiveIdle = idle ?? (settingDefinition("sessionIdleSeconds").default as number);
    const effectiveAbsolute = absolute ?? (settingDefinition("sessionAbsoluteSeconds").default as number);
    if (effectiveIdle > effectiveAbsolute) {
      add({
        id: "policy.idle-exceeds-absolute", severity: "info", setting: "sessionIdleSeconds",
        title: "The inactivity limit is longer than the maximum session length",
        why: "The maximum length wins, so sessions end sooner than the inactivity limit suggests.",
      });
    }
  }
  if (valid.monitorAllowPrivateTargets === true) {
    add({
      id: "monitor.private-targets", severity: "info", setting: "monitorAllowPrivateTargets",
      title: "Monitors may check private network addresses",
      why: "Anyone who can create a monitor can make this server request internal services. Webhooks and notifications stay blocked from private ranges.",
    });
  }

  return findings.sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity));
}

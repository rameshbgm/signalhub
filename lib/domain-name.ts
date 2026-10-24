/** Pure and client-safe: the add-monitor form uses it to explain why domain expiry is unavailable. */
const isIpAddress = (host: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");

/** Hostnames in a monitor's target; null for types without one (heartbeats). */
export function monitorHostname(type: string, target: string): string | null {
  if (type === "HEARTBEAT") return null;
  const value = target.trim();
  if (!value) return null;
  try {
    return (value.includes("://") ? new URL(value).hostname : value.split(/[/:?#]/)[0]).replace(/^\[|\]$/g, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

const LOCAL_SUFFIXES = ["localhost", "local", "internal", "lan", "home", "corp", "test", "example", "invalid", "localdomain"];

export type DomainEligibility = { ok: true; labels: string[] } | { ok: false; reason: string };

/** Whether a host can have a registered domain whose expiry is publicly queryable. */
export function domainEligibility(hostname: string | null): DomainEligibility {
  if (!hostname) return { ok: false, reason: "there is no host name to look up" };
  if (isIpAddress(hostname)) return { ok: false, reason: "it is an IP address, not a domain name" };
  const labels = hostname.replace(/\.$/, "").split(".");
  if (labels.length < 2 || labels.some((label) => !label)) return { ok: false, reason: "it has no registrable domain (a single-label name has no public suffix)" };
  if (LOCAL_SUFFIXES.includes(labels.at(-1)!)) return { ok: false, reason: `its suffix ".${labels.at(-1)}" is not a public domain registry` };
  return { ok: true, labels };
}

/**
 * Names to try against RDAP, most likely first. There is no public-suffix list here:
 * the last two labels cover most domains, and one more label covers suffixes like co.uk.
 * ponytail: swap in the `psl` package if multi-label suffixes (co.uk, com.au) miss often.
 */
export function registrableCandidates(labels: string[]) {
  const names = [labels.slice(-2).join(".")];
  if (labels.length >= 3) names.push(labels.slice(-3).join("."));
  return names;
}

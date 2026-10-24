import { guardedFetch } from "@/lib/guarded-fetch";
import { domainEligibility, registrableCandidates } from "@/lib/domain-name";
import { limitedResponseText } from "@/lib/limited-response";

const BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
const BOOTSTRAP_TTL_MS = 24 * 3_600_000;

type Bootstrap = { services?: [string[], string[]][] };
let cached: { at: number; byTld: Map<string, string> } | null = null;

/** TLD to RDAP server from IANA's bootstrap file, whose `services` are [[tlds], [urls]] pairs. */
export function rdapServers(bootstrap: Bootstrap) {
  const byTld = new Map<string, string>();
  for (const [tlds, urls] of bootstrap.services ?? []) {
    const url = urls.find((candidate) => candidate.startsWith("https://")) ?? urls[0];
    if (url) for (const tld of tlds) byTld.set(tld.toLowerCase(), url);
  }
  return byTld;
}

/** The registry-reported expiration date from an RDAP domain response. */
export function parseRdapExpiry(body: unknown): Date | null {
  const events = (body as { events?: { eventAction?: string; eventDate?: string }[] } | null)?.events;
  const event = events?.find((candidate) => candidate.eventAction === "expiration");
  const time = Date.parse(event?.eventDate ?? "");
  return Number.isFinite(time) ? new Date(time) : null;
}

async function fetchJson(url: string) {
  const response = await guardedFetch(url, { headers: { accept: "application/rdap+json, application/json" }, signal: AbortSignal.timeout(10_000) });
  if (response.status === 404) { await response.body?.cancel(); return null; }
  if (!response.ok) { await response.body?.cancel(); throw new Error(`RDAP server answered HTTP ${response.status}`); }
  return JSON.parse(await limitedResponseText(response)) as unknown;
}

async function rdapBase(tld: string) {
  if (!cached || Date.now() - cached.at > BOOTSTRAP_TTL_MS) {
    const bootstrap = (await fetchJson(BOOTSTRAP_URL)) as Bootstrap | null;
    if (!bootstrap) throw new Error("RDAP bootstrap file not found");
    cached = { at: Date.now(), byTld: rdapServers(bootstrap) };
  }
  return cached.byTld.get(tld) ?? null;
}

/** Looks up when a host's registered domain expires. Throws when the registry cannot be reached. */
export async function lookupDomainExpiry(hostname: string): Promise<{ domain: string; expiresAt: Date } | null> {
  const eligibility = domainEligibility(hostname);
  if (!eligibility.ok) return null;
  const base = await rdapBase(eligibility.labels.at(-1)!);
  if (!base) return null;
  for (const domain of registrableCandidates(eligibility.labels)) {
    const body = await fetchJson(`${base.replace(/\/$/, "")}/domain/${encodeURIComponent(domain)}`);
    const expiresAt = body ? parseRdapExpiry(body) : null;
    if (expiresAt) return { domain, expiresAt };
  }
  return null;
}

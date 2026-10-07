import { randomBytes } from "node:crypto";
import { templateDesign } from "@/lib/page-design";
import { closeDatabase, database, postgresPool } from "@/lib/postgres/client";
import type { DatabaseTransaction } from "@/lib/postgres/client";
import type { Insertable } from "kysely";
import type { SignalHubDatabase } from "@/lib/postgres/schema";
import { createPreparedMonitor, prepareMonitorInput, type MonitorInput } from "@/lib/domain/monitors";
import { generateAutomationToken } from "@/lib/tokens";
import { assertDevelopmentSeedEnabled, generateDevelopmentPassword, printGeneratedSecrets } from "@/scripts/dev-seed";
import { hashPassword } from "@/lib/auth";
import { EXTRA_HUBS, type HubSpec, type PageSpec, type Spec } from "@/scripts/demo-catalog";

/**
 * Wipes every page (and everything under it: components, monitors, checks, metrics,
 * incidents, maintenance, subscribers, analytics, notifications) then seeds a demo
 * installation. Users, organizations, memberships, sessions and audit logs are kept.
 * Needs ALLOW_DEV_SEED=true and CONFIRM_DEV_DATABASE_RESET=<database name>.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const HISTORY_DAYS = 7;
const ORG_SLUG = "acme";

// Deterministic PRNG so reruns produce the same history.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ago = (ms: number) => new Date(Date.now() - ms);
const ahead = (ms: number) => new Date(Date.now() + ms);

const h = (path: string) => `https://httpbin.org${path}`;
const PAGES: PageSpec[] = [
  {
    slug: "httpbin-lab", name: "HTTP Test Lab", color: "#0f9fab",
    headline: "HTTP Test Lab status", about: "Synthetic endpoints from httpbin.org used to exercise every monitor path.",
    groups: [
      { name: "Status Codes", description: "Fixed status code responders", monitors: [
        { name: "200 OK", target: h("/status/200") },
        { name: "201 Created", target: h("/status/201") },
        { name: "202 Accepted", target: h("/status/202") },
        { name: "204 No Content", target: h("/status/204") },
        { name: "404 Not Found (expected)", target: h("/status/404"), range: "404-404" },
        { name: "503 Upstream Unavailable", target: h("/status/503"), expectFail: true },
      ] },
      { name: "Response Formats", description: "Content negotiation and encodings", monitors: [
        { name: "JSON document", target: h("/json"), kind: "KEYWORD", keyword: "slideshow" },
        { name: "HTML document", target: h("/html"), kind: "KEYWORD", keyword: "Herman Melville" },
        { name: "XML document", target: h("/xml") },
        { name: "robots.txt", target: h("/robots.txt") },
        { name: "Gzip encoding", target: h("/gzip") },
        { name: "Deflate encoding", target: h("/deflate") },
        { name: "UTF-8 sample", target: h("/encoding/utf8") },
      ] },
      { name: "Request Inspection", description: "Echo and identity endpoints", monitors: [
        { name: "GET echo", target: h("/get") },
        { name: "Request headers", target: h("/headers") },
        { name: "Client IP", target: h("/ip") },
        { name: "User agent", target: h("/user-agent") },
        { name: "UUID generator", target: h("/uuid") },
      ] },
      { name: "Latency", description: "Deliberately slow responders", monitors: [
        { name: "1 second delay", target: h("/delay/1") },
        { name: "2 second delay", target: h("/delay/2") },
        { name: "1 KB payload", target: h("/bytes/1024") },
      ] },
    ],
  },
  {
    slug: "cloud-hosting", name: "Cloud & Hosting", color: "#2563eb",
    headline: "Cloud & hosting providers", about: "Public marketing and console front doors of major cloud and hosting vendors.",
    groups: [
      { name: "Hyperscalers", description: "Big three clouds", monitors: [
        { name: "AWS", target: "https://aws.amazon.com" },
        { name: "Google Cloud", target: "https://cloud.google.com" },
        { name: "Microsoft Azure", target: "https://azure.microsoft.com" },
      ] },
      { name: "Edge & CDN", description: "Delivery networks", monitors: [
        { name: "Cloudflare", target: "https://www.cloudflare.com" },
        { name: "Fastly", target: "https://www.fastly.com" },
        { name: "Akamai", target: "https://www.akamai.com" },
      ] },
      { name: "Developer Platforms", description: "PaaS and static hosting", monitors: [
        { name: "DigitalOcean", target: "https://www.digitalocean.com" },
        { name: "Vercel", target: "https://vercel.com" },
        { name: "Netlify", target: "https://www.netlify.com" },
        { name: "Heroku", target: "https://www.heroku.com" },
      ] },
    ],
  },
  {
    slug: "dev-tools", name: "Developer Tools", color: "#7c3aed",
    headline: "Developer tooling status", about: "Source hosts, package registries and language sites our builds depend on.",
    groups: [
      { name: "Source Hosting", description: "Git platforms", monitors: [
        { name: "GitHub", target: "https://github.com" },
        { name: "GitLab", target: "https://gitlab.com" },
        { name: "Bitbucket", target: "https://bitbucket.org" },
      ] },
      { name: "Package Registries", description: "Dependency download endpoints", monitors: [
        { name: "npm registry", target: "https://registry.npmjs.org/" },
        { name: "PyPI", target: "https://pypi.org/simple/" },
        { name: "crates.io", target: "https://crates.io" },
        { name: "RubyGems", target: "https://rubygems.org" },
        { name: "Docker Hub", target: "https://hub.docker.com" },
      ] },
      { name: "Language Sites", description: "Docs and downloads", monitors: [
        { name: "Node.js", target: "https://nodejs.org" },
        { name: "Python", target: "https://www.python.org" },
        { name: "Go", target: "https://go.dev" },
        { name: "Rust", target: "https://www.rust-lang.org" },
        { name: "Stack Overflow", target: "https://stackoverflow.com" },
      ] },
    ],
  },
  {
    slug: "public-apis", name: "Public APIs", color: "#059669",
    headline: "Third-party API availability", about: "Free public JSON APIs we use in demos and integration tests.",
    groups: [
      { name: "Data APIs", description: "Reference data", monitors: [
        { name: "JSONPlaceholder posts", target: "https://jsonplaceholder.typicode.com/posts/1", kind: "KEYWORD", keyword: "userId" },
        { name: "REST Countries", target: "https://restcountries.com/v3.1/name/india", kind: "KEYWORD", keyword: "India" },
        { name: "Open Library search", target: "https://openlibrary.org/search.json?q=signal&limit=1" },
        { name: "PokeAPI", target: "https://pokeapi.co/api/v2/pokemon/1", kind: "KEYWORD", keyword: "bulbasaur" },
      ] },
      { name: "Utility APIs", description: "Small helper services", monitors: [
        { name: "GitHub REST API", target: "https://api.github.com" },
        { name: "ipify", target: "https://api.ipify.org?format=json", kind: "KEYWORD", keyword: "ip" },
        { name: "Open-Meteo forecast", target: "https://api.open-meteo.com/v1/forecast?latitude=52.5&longitude=13.4&current_weather=true", kind: "KEYWORD", keyword: "current_weather" },
      ] },
      { name: "Fun APIs", description: "Random content", monitors: [
        { name: "Cat Facts", target: "https://catfact.ninja/fact", kind: "KEYWORD", keyword: "fact" },
        { name: "Dog CEO", target: "https://dog.ceo/api/breeds/image/random", kind: "KEYWORD", keyword: "success" },
        { name: "Chuck Norris Jokes", target: "https://api.chucknorris.io/jokes/random" },
      ] },
    ],
  },
  {
    slug: "saas-payments", name: "SaaS & Payments", color: "#db2777",
    headline: "SaaS & payment providers", about: "Business-critical SaaS vendors and communication providers.",
    groups: [
      { name: "Payments & Commerce", description: "Money movement", monitors: [
        { name: "Stripe", target: "https://stripe.com" },
        { name: "Shopify", target: "https://www.shopify.com" },
        { name: "PayPal", target: "https://www.paypal.com" },
      ] },
      { name: "Communication", description: "Messaging, email and voice", monitors: [
        { name: "Twilio", target: "https://www.twilio.com" },
        { name: "SendGrid", target: "https://sendgrid.com" },
        { name: "Slack", target: "https://slack.com" },
        { name: "Zoom", target: "https://zoom.us" },
      ] },
      { name: "Productivity", description: "Collaboration suites", monitors: [
        { name: "Atlassian", target: "https://www.atlassian.com" },
        { name: "Notion", target: "https://www.notion.so" },
        { name: "Figma", target: "https://www.figma.com" },
      ] },
    ],
  },
  {
    slug: "network-dns", name: "Network & DNS", color: "#ea580c",
    headline: "Network, DNS and TLS health", about: "Non-HTTP checks: DNS resolution, TCP ports, TLS certificates and ICMP reachability.",
    groups: [
      { name: "DNS Resolution", description: "Authoritative lookups", monitors: [
        { name: "google.com A record", target: "google.com", kind: "DNS" },
        { name: "cloudflare.com A record", target: "cloudflare.com", kind: "DNS" },
        { name: "github.com A record", target: "github.com", kind: "DNS" },
      ] },
      { name: "TCP Ports", description: "Raw socket connects", monitors: [
        { name: "Cloudflare DNS (TCP 53)", target: "1.1.1.1", kind: "TCP", port: 53 },
        { name: "Google DNS (TCP 53)", target: "8.8.8.8", kind: "TCP", port: 53 },
        { name: "GitHub HTTPS (TCP 443)", target: "github.com", kind: "TCP", port: 443 },
      ] },
      { name: "TLS Certificates", description: "Certificate expiry", monitors: [
        { name: "github.com certificate", target: "github.com", kind: "TLS", port: 443 },
        { name: "cloudflare.com certificate", target: "www.cloudflare.com", kind: "TLS", port: 443 },
        { name: "python.org certificate", target: "www.python.org", kind: "TLS", port: 443 },
      ] },
      { name: "ICMP", description: "Ping reachability", monitors: [
        { name: "Cloudflare resolver ping", target: "1.1.1.1", kind: "ICMP" },
        { name: "Google resolver ping", target: "8.8.8.8", kind: "ICMP" },
      ] },
    ],
  },
];

const ACME_HUB: HubSpec = {
  slug: "acme-hub", name: "Acme Service Hub", headline: "All Acme services", about: "Every service status in one place.", color: "#0f9fab", pages: PAGES,
};
const ALL_HUBS: HubSpec[] = [ACME_HUB, ...EXTRA_HUBS];

// Incident timelines: [hours-ago-started, hours-ago-resolved|null, component name, ...]
type IncidentSpec = {
  page: string; name: string; impact: "MINOR" | "MAJOR" | "CRITICAL"; component: string;
  componentStatus: string; startedH: number; resolvedH: number | null; postmortem?: string;
  steps: Array<[string, string]>; // [status, body] spread evenly between start and end
};
const INCIDENTS: IncidentSpec[] = [
  { page: "httpbin-lab", name: "Upstream returning 503", impact: "MAJOR", component: "503 Upstream Unavailable", componentStatus: "MAJOR_OUTAGE", startedH: 5, resolvedH: null, steps: [
    ["INVESTIGATING", "Monitors report sustained 503 responses from the status-code responder."],
    ["IDENTIFIED", "Cause identified: the endpoint is configured to always return 503. Tracking as expected failure."] ] },
  { page: "httpbin-lab", name: "Elevated latency on delay endpoints", impact: "MINOR", component: "2 second delay", componentStatus: "DEGRADED_PERFORMANCE", startedH: 72, resolvedH: 70, postmortem: "Latency rose from 2s to 4s for ~2 hours because of upstream congestion. No action required.", steps: [
    ["INVESTIGATING", "Investigating response times above the 2s baseline."],
    ["MONITORING", "Latency returning to normal."],
    ["RESOLVED", "Latency back within baseline."] ] },
  { page: "cloud-hosting", name: "CDN cache miss spike", impact: "MAJOR", component: "Cloudflare", componentStatus: "PARTIAL_OUTAGE", startedH: 120, resolvedH: 117, postmortem: "A purge storm invalidated edge caches. Origin shielding was enabled and purge rate limited.", steps: [
    ["INVESTIGATING", "Cache hit ratio dropped sharply across edge locations."],
    ["IDENTIFIED", "Purge storm identified as root cause."],
    ["RESOLVED", "Cache hit ratio restored."] ] },
  { page: "cloud-hosting", name: "Dashboard login failures", impact: "MINOR", component: "Vercel", componentStatus: "DEGRADED_PERFORMANCE", startedH: 26, resolvedH: 25, steps: [
    ["INVESTIGATING", "Some users cannot sign in to the dashboard."],
    ["RESOLVED", "Sign-in fixed after a session store failover."] ] },
  { page: "dev-tools", name: "Delayed registry replication", impact: "MINOR", component: "npm registry", componentStatus: "DEGRADED_PERFORMANCE", startedH: 2, resolvedH: null, steps: [
    ["INVESTIGATING", "Newly published packages take longer than usual to appear."],
    ["MONITORING", "Replication lag is shrinking; watching for recovery."] ] },
  { page: "dev-tools", name: "Package install slowdowns", impact: "MINOR", component: "PyPI", componentStatus: "DEGRADED_PERFORMANCE", startedH: 50, resolvedH: 48, steps: [
    ["INVESTIGATING", "Slow downloads reported from the simple index."],
    ["RESOLVED", "CDN rerouted; downloads normal."] ] },
  { page: "public-apis", name: "Upstream provider outage", impact: "CRITICAL", component: "PokeAPI", componentStatus: "MAJOR_OUTAGE", startedH: 140, resolvedH: 136, postmortem: "Provider hosting incident. We added a retry budget and a second data source to the runbook.", steps: [
    ["INVESTIGATING", "All requests to the upstream are failing."],
    ["IDENTIFIED", "Provider acknowledged a hosting incident."],
    ["MONITORING", "Provider reports recovery; verifying."],
    ["RESOLVED", "Fully recovered."] ] },
  { page: "saas-payments", name: "Intermittent webhook delivery delays", impact: "MINOR", component: "Twilio", componentStatus: "DEGRADED_PERFORMANCE", startedH: 96, resolvedH: 94, steps: [
    ["INVESTIGATING", "Callbacks arriving several minutes late."],
    ["RESOLVED", "Backlog cleared."] ] },
];

const GENERATED_INCIDENTS: Array<{ name: string; impact: "MINOR" | "MAJOR" | "CRITICAL"; componentStatus: string; steps: (component: string) => Array<[string, string]> }> = [
  { name: "Elevated error rates", impact: "MAJOR", componentStatus: "PARTIAL_OUTAGE", steps: (c) => [
    ["INVESTIGATING", `We are seeing elevated error rates when reaching ${c}.`],
    ["IDENTIFIED", `The cause for the errors on ${c} was identified and a fix is being prepared.`],
    ["RESOLVED", `Error rates on ${c} are back to normal.`] ] },
  { name: "Increased latency", impact: "MINOR", componentStatus: "DEGRADED_PERFORMANCE", steps: (c) => [
    ["INVESTIGATING", `Responses from ${c} are slower than usual.`],
    ["MONITORING", `A mitigation is in place for ${c}; latency is dropping.`],
    ["RESOLVED", `Latency on ${c} has returned to baseline.`] ] },
  { name: "Intermittent connection failures", impact: "MINOR", componentStatus: "DEGRADED_PERFORMANCE", steps: (c) => [
    ["INVESTIGATING", `Some connections to ${c} fail intermittently.`],
    ["RESOLVED", `Connections to ${c} are stable again.`] ] },
  { name: "Regional disruption", impact: "MAJOR", componentStatus: "PARTIAL_OUTAGE", steps: (c) => [
    ["INVESTIGATING", `Users in one region cannot reach ${c}.`],
    ["IDENTIFIED", `A routing issue affecting ${c} was identified.`],
    ["MONITORING", `Routing was corrected for ${c}; we are watching recovery.`],
    ["RESOLVED", `${c} is reachable from all regions.`] ] },
  { name: "Service disruption", impact: "CRITICAL", componentStatus: "MAJOR_OUTAGE", steps: (c) => [
    ["INVESTIGATING", `${c} is currently unavailable.`],
    ["IDENTIFIED", `The root cause of the ${c} outage was found.`],
    ["MONITORING", `${c} is recovering; we are verifying stability.`],
    ["RESOLVED", `${c} is fully operational again.`] ] },
  { name: "Delayed data synchronization", impact: "MINOR", componentStatus: "DEGRADED_PERFORMANCE", steps: (c) => [
    ["INVESTIGATING", `Data shown for ${c} may be out of date.`],
    ["RESOLVED", `Synchronization for ${c} caught up.`] ] },
];
const GENERATED_MAINTENANCE = [
  "Database upgrade", "Certificate rotation", "Network configuration change", "Storage migration",
  "Platform security patching", "Load balancer replacement", "Cache cluster resize", "DNS provider cutover",
];

type MaintenanceSpec = {
  page: string; name: string; components: string[]; startH: number; durationH: number; body: string;
};
// Positive startH = future window, negative = already completed.
const MAINTENANCES: MaintenanceSpec[] = [
  { page: "cloud-hosting", name: "Edge network certificate rotation", components: ["Cloudflare", "Fastly"], startH: 40, durationH: 2, body: "Certificates on the edge fleet will be rotated. Brief connection resets possible." },
  { page: "cloud-hosting", name: "Console database upgrade", components: ["Vercel", "Netlify"], startH: -100, durationH: 3, body: "Dashboard databases upgraded to the next major version." },
  { page: "dev-tools", name: "Registry storage migration", components: ["npm registry", "PyPI"], startH: 120, durationH: 4, body: "Package storage moves to a new region; installs may be slower." },
  { page: "dev-tools", name: "Git hosting maintenance", components: ["GitLab"], startH: -60, durationH: 1, body: "Rolling restart of Git storage nodes." },
  { page: "network-dns", name: "Resolver anycast changes", components: ["Cloudflare DNS (TCP 53)"], startH: 22, durationH: 1, body: "Anycast routes will be adjusted; resolvers stay available." },
  { page: "saas-payments", name: "Payments API version cutover", components: ["Stripe", "PayPal"], startH: -30, durationH: 2, body: "Cutover to the new payments API version." },
];

const ANNOUNCEMENTS: Array<{ page: string; title: string; body: string; severity: "INFO" | "SUCCESS" | "WARNING" | "CRITICAL" }> = [
  { page: "httpbin-lab", title: "Synthetic data", body: "These monitors check httpbin.org; the 503 monitor is expected to fail.", severity: "INFO" },
  { page: "cloud-hosting", title: "Upcoming maintenance", body: "Edge certificate rotation is scheduled in the next two days.", severity: "WARNING" },
];

const CUSTOM_METRICS = [
  { name: "Requests per second", suffix: "req/s", description: "Traffic served across all services", base: 420, decimals: 0 },
  { name: "Error rate", suffix: "%", description: "Share of failed requests", base: 0.8, decimals: 2 },
  { name: "Queue depth", suffix: "jobs", description: "Pending background jobs", base: 140, decimals: 0 },
  { name: "Apdex score", suffix: "", description: "User satisfaction index", base: 0.94, decimals: 2 },
  { name: "Data transferred", suffix: "MB/s", description: "Outbound bandwidth", base: 85, decimals: 1 },
];
const SUBSCRIBER_NAMES = ["alice", "bob", "carol", "dave", "erin", "frank", "grace", "heidi", "ivan", "judy", "mallory", "niaj", "olivia", "peggy", "quinn", "rupert"];

async function createPage(
  tx: DatabaseTransaction,
  orgId: string,
  spec: { slug: string; name: string; headline: string; about: string; color: string; isHub?: boolean; hubParentId?: string; access?: "PUBLIC" | "PRIVATE" | "AUDIENCE"; state?: "published" | "draft" | "hidden"; passwordHash?: string | null },
) {
  const now = new Date();
  return tx.insertInto("pages").values({
    orgId, name: spec.name, slug: spec.slug, type: spec.access ?? "PUBLIC",
    isHub: spec.isHub ?? false, hubParentId: spec.hubParentId ?? null,
    timezone: "UTC", language: "en", headline: spec.headline, aboutText: spec.about,
    coverImageFit: "CONTAIN", coverImagePositionX: 50, coverImagePositionY: 50,
    brandColor: spec.color, layout: "CENTERED_SUMMARY", passwordHash: spec.passwordHash ?? null, removeBranding: false,
    customCss: null, themePreset: "DEFAULT", analyticsEnabled: true,
    publishedDesign: templateDesign("CENTERED_SUMMARY", spec.color), publishedDesignVersion: 1,
    designPublishedAt: now, publicVisible: spec.state !== "hidden",
    setupCompletedAt: spec.state === "draft" ? null : now, deletedAt: null, deletedBy: null, createdAt: now,
  }).returningAll().executeTakeFirstOrThrow();
}

function monitorInput(spec: Spec, componentId: string, groupName: string, pageSlug: string): MonitorInput {
  const kind = spec.kind ?? "HTTP";
  const web = kind === "HTTP" || kind === "KEYWORD";
  return {
    name: spec.name, type: kind, componentId, target: spec.target, port: spec.port ?? null,
    method: "GET", requestBody: null, requestHeaders: "", expectedStatusRange: spec.range ?? "200-299",
    keywordMatch: spec.keyword ?? null, keywordAbsent: null, sslWarnDays: kind === "TLS" ? 14 : null,
    authType: "NONE", authUsername: null, authSecret: null, authHeaderName: null, verifyTls: true,
    intervalSec: (spec.minutes ?? (web ? 10 : 15)) * 60, timeoutMs: 10_000,
    failThreshold: 2, recoverThreshold: 1, downStatus: spec.expectFail ? "MAJOR_OUTAGE" : "PARTIAL_OUTAGE",
    actionFlipStatus: true, actionRecordMetric: kind !== "TLS", actionAutoIncident: false, actionNotify: true,
    tags: [pageSlug, kind.toLowerCase()], groupName,
    dnsRecordType: kind === "DNS" ? "A" : null, dnsExpectedValue: null,
  };
}

async function chunked<T>(rows: T[], size: number, insert: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size));
}

async function main() {
  assertDevelopmentSeedEnabled("The demo seed");
  const dbName = (await postgresPool.query<{ name: string }>("select current_database() as name")).rows[0]?.name;
  if (process.env.CONFIRM_DEV_DATABASE_RESET !== dbName) {
    throw new Error(`Set CONFIRM_DEV_DATABASE_RESET=${dbName} to confirm wiping pages in this database.`);
  }
  const org = await database.selectFrom("organizations").selectAll().where("slug", "=", ORG_SLUG).executeTakeFirstOrThrow();
  const admin = await database.selectFrom("memberships").select("userId").where("orgId", "=", org.id).where("role", "=", "ADMIN").executeTakeFirstOrThrow();

  // Cascades through components, monitors, checks, metrics, incidents, subscribers, analytics, notifications.
  const wiped = await database.deleteFrom("pages").executeTakeFirst();
  console.log(`Wiped ${wiped.numDeletedRows} pages (users, organizations and audit logs kept).`);

  const random = rng(42);
  const ids = new Map<string, { pageId: string; components: Map<string, string> }>();
  const monitorRows: Array<{ id: string; componentId: string; metricId: string | null; ok: boolean; base: number; pageSlug: string }> = [];

  const sharedPassword = process.env.DEV_AUDIENCE_PASSWORD || generateDevelopmentPassword();
  const sharedPasswordHash = await hashPassword(sharedPassword);
  const hubIds: Array<{ id: string; slug: string }> = [];
  const pageMeta = new Map<string, PageSpec>();

  for (const hubSpec of ALL_HUBS) {
    const hub = await database.transaction().execute((tx) => createPage(tx, org.id, { ...hubSpec, isHub: true }));
    hubIds.push({ id: hub.id, slug: hub.slug });
    console.log(`hub ${hubSpec.slug}: ${hubSpec.pages.length} pages`);
    for (const spec of hubSpec.pages) {
      const page = await database.transaction().execute((tx) => createPage(tx, org.id, {
        ...spec, hubParentId: hub.id, passwordHash: spec.access && spec.access !== "PUBLIC" ? sharedPasswordHash : null,
      }));
      pageMeta.set(spec.slug, spec);
      const components = new Map<string, string>();
      let order = 0;
      for (const [groupIndex, group] of spec.groups.entries()) {
        const g = await database.insertInto("componentGroups").values({
          pageId: page.id, name: group.name, description: group.description, order: groupIndex, collapsed: false,
        }).returning("id").executeTakeFirstOrThrow();
        for (const m of group.monitors) {
          const token = generateAutomationToken();
          const component = await database.insertInto("components").values({
            pageId: page.id, groupId: g.id, name: m.name, description: `${m.name} availability`,
            status: "OPERATIONAL", order: order++, visible: !m.unpublished, showUptime: true, manualStatus: "OPERATIONAL",
            isThirdParty: false, thirdPartyProvider: null, automationTokenHash: token.hash,
            automationTokenPrefix: token.prefix, automationTokenLastFour: token.lastFour, createdAt: ago(HISTORY_DAYS * DAY),
          }).returning("id").executeTakeFirstOrThrow();
          components.set(m.name, component.id);
          const input = await prepareMonitorInput(monitorInput(m, component.id, group.name, spec.slug));
          const monitor = await database.transaction().execute((tx) => createPreparedMonitor(org.id, page.id, input, tx));
          if (m.paused) await database.updateTable("monitors").set({ enabled: false, runRequestedAt: null }).where("id", "=", monitor.id).execute();
          monitorRows.push({
            id: monitor.id, componentId: component.id, metricId: monitor.metricId, ok: !m.expectFail,
            base: m.kind === "DNS" ? 20 : m.kind === "TCP" || m.kind === "ICMP" ? 15 : 80 + random() * 400, pageSlug: spec.slug,
          });
        }
      }
      ids.set(spec.slug, { pageId: page.id, components });

      if (spec.access === "AUDIENCE") {
        const names = [...components.keys()];
        const groupA = await database.insertInto("pageAccessGroups").values({ pageId: page.id, name: "Partners", componentIds: [...components.values()].slice(0, Math.ceil(names.length / 2)) }).returning("id").executeTakeFirstOrThrow();
        await database.insertInto("pageAccessGroups").values({ pageId: page.id, name: "Auditors", componentIds: [...components.values()] }).execute();
        await database.insertInto("pageAccessUsers").values([
          { pageId: page.id, email: `partner@${spec.slug}.example.com`, passwordHash: sharedPasswordHash, groupId: groupA.id, componentIds: [], createdAt: new Date() },
          { pageId: page.id, email: `analyst@${spec.slug}.example.com`, passwordHash: sharedPasswordHash, groupId: null, componentIds: [...components.values()].slice(0, 2), createdAt: new Date() },
        ]).execute();
      }
      console.log(`  page ${spec.slug}: ${components.size} monitors`);
    }
  }

  // Incident and maintenance outage windows per component, used to build status timelines and check failures.
  const outages = new Map<string, Array<{ from: Date; to: Date | null; status: string; maintenance: boolean; note: string }>>();
  const addOutage = (componentId: string, o: { from: Date; to: Date | null; status: string; maintenance: boolean; note: string }) =>
    outages.set(componentId, [...(outages.get(componentId) ?? []), o]);

  const makeIncident = async (inc: IncidentSpec) => {
    const page = ids.get(inc.page)!;
    const componentId = page.components.get(inc.component)!;
    const started = ago(inc.startedH * HOUR);
    const resolved = inc.resolvedH === null ? null : ago(inc.resolvedH * HOUR);
    const incident = await database.insertInto("incidents").values({
      pageId: page.pageId, name: inc.name, status: resolved ? "RESOLVED" : inc.steps.at(-1)![0], impact: inc.impact,
      pageWide: false, isMaintenance: false, maintenanceStatus: null, notifySubscribers: true,
      postmortemBody: inc.postmortem ?? null, postmortemPublishedAt: inc.postmortem && resolved ? resolved : null,
      createdAt: started, resolvedAt: resolved, backfilled: false,
    }).returning("id").executeTakeFirstOrThrow();
    await database.insertInto("incidentComponents").values({ incidentId: incident.id, componentId, newStatus: inc.componentStatus }).execute();
    const end = (resolved ?? new Date()).getTime();
    await database.insertInto("incidentUpdates").values(inc.steps.map(([status, body], i) => ({
      incidentId: incident.id, status, body, notified: true,
      createdAt: new Date(started.getTime() + ((end - started.getTime()) * i) / Math.max(inc.steps.length - 1, 1)),
    }))).execute();
    addOutage(componentId, { from: started, to: resolved, status: inc.componentStatus, maintenance: false, note: inc.name });
    if (!resolved) await database.updateTable("components").set({ status: inc.componentStatus, manualStatus: inc.componentStatus }).where("id", "=", componentId).execute();
  };
  for (const inc of INCIDENTS) await makeIncident(inc);

  const makeMaintenance = async (m: MaintenanceSpec) => {
    const page = ids.get(m.page)!;
    const start = ahead(m.startH * HOUR);
    const end = new Date(start.getTime() + m.durationH * HOUR);
    const done = end.getTime() < Date.now();
    const running = !done && start.getTime() <= Date.now();
    const state = done ? "COMPLETED" : running ? "IN_PROGRESS" : "SCHEDULED";
    const componentIds = m.components.map((name) => page.components.get(name)!);
    const incident = await database.insertInto("incidents").values({
      pageId: page.pageId, name: m.name, status: done ? "RESOLVED" : "INVESTIGATING", impact: "NONE", pageWide: false,
      isMaintenance: true, maintenanceStatus: state, scheduledStart: start, scheduledEnd: end,
      autoTransition: true, reminderMinutesBefore: state === "SCHEDULED" ? 60 : null, notifySubscribers: true, postmortemBody: null,
      createdAt: new Date(Math.min(start.getTime(), Date.now()) - 2 * DAY), resolvedAt: done ? end : null, backfilled: false,
    }).returning("id").executeTakeFirstOrThrow();
    await database.insertInto("incidentComponents").values(componentIds.map((componentId) => ({ incidentId: incident.id, componentId, newStatus: "UNDER_MAINTENANCE" }))).execute();
    await database.insertInto("incidentUpdates").values([
      { incidentId: incident.id, status: "INVESTIGATING", body: m.body, notified: true, createdAt: new Date(Math.min(start.getTime(), Date.now()) - 2 * DAY) },
      ...(done || running ? [{ incidentId: incident.id, status: "INVESTIGATING", body: "Maintenance window has started.", notified: true, createdAt: start }] : []),
      ...(done ? [{ incidentId: incident.id, status: "RESOLVED", body: "Maintenance completed successfully.", notified: true, createdAt: end }] : []),
    ]).execute();
    for (const componentId of componentIds) {
      if (done || running) addOutage(componentId, { from: start, to: done ? end : null, status: "UNDER_MAINTENANCE", maintenance: true, note: m.name });
      if (running) await database.updateTable("components").set({ status: "UNDER_MAINTENANCE", manualStatus: "UNDER_MAINTENANCE" }).where("id", "=", componentId).execute();
    }
  };
  for (const m of MAINTENANCES) await makeMaintenance(m);

  // Generated history for every other page so each hub looks lived-in.
  const explicitPages = new Set([...INCIDENTS.map((i) => i.page), ...MAINTENANCES.map((m) => m.page)]);
  const draftSlugs = new Set([...pageMeta].filter(([, spec]) => spec.state === "draft").map(([slug]) => slug));
  let generatedIncidents = 0;
  let generatedMaintenances = 0;
  for (const [slug, page] of ids) {
    if (explicitPages.has(slug) || draftSlugs.has(slug)) continue;
    const names = [...page.components.keys()];
    const pick = () => names[Math.floor(random() * names.length)]!;
    const count = 1 + Math.floor(random() * 3);
    let activeUsed = false;
    for (let i = 0; i < count; i++) {
      const template = GENERATED_INCIDENTS[Math.floor(random() * GENERATED_INCIDENTS.length)]!;
      const component = pick();
      const startedH = 6 + Math.floor(random() * 150);
      const active: boolean = !activeUsed && i === 0 && random() < 0.35;
      activeUsed ||= active;
      const durationH = 1 + Math.floor(random() * 6);
      const incident: IncidentSpec = {
        page: slug, name: `${template.name}: ${component}`, impact: template.impact, component, componentStatus: template.componentStatus,
        startedH: active ? 1 + Math.floor(random() * 5) : startedH, resolvedH: active ? null : Math.max(startedH - durationH, 1),
        postmortem: !active && template.impact !== "MINOR" ? `${template.name} on ${component}. Root cause was identified, a fix was rolled out and monitoring was tightened.` : undefined,
        steps: template.steps(component).filter((_, idx, all) => !active || idx < all.length - 1),
      };
      await makeIncident(incident);
      generatedIncidents++;
    }
    const maintenanceKinds = [[-(30 + Math.floor(random() * 100)), 2], [12 + Math.floor(random() * 150), 3], [-1, 4]] as const;
    for (const [startH, durationH] of maintenanceKinds) {
      if (random() > (startH === -1 ? 0.12 : 0.5)) continue;
      const components = [pick(), pick()].filter((n, idx, all) => all.indexOf(n) === idx);
      await makeMaintenance({ page: slug, name: GENERATED_MAINTENANCE[Math.floor(random() * GENERATED_MAINTENANCE.length)]!, components, startH, durationH, body: "Planned work on the listed services. Brief interruptions are possible." });
      generatedMaintenances++;
    }
  }

  // Component status timelines.
  const events: Insertable<SignalHubDatabase["componentStatusEvents"]>[] = [];
  for (const row of monitorRows) {
    let cursor = ago(HISTORY_DAYS * DAY);
    for (const o of (outages.get(row.componentId) ?? []).sort((a, b) => a.from.getTime() - b.from.getTime())) {
      events.push({ componentId: row.componentId, status: "OPERATIONAL", startedAt: cursor, endedAt: o.from, isMaintenance: false, note: "Seed baseline" });
      events.push({ componentId: row.componentId, status: o.status, startedAt: o.from, endedAt: o.to, isMaintenance: o.maintenance, note: o.note });
      cursor = o.to ?? ahead(DAY * 365);
    }
    if (cursor.getTime() <= Date.now()) events.push({ componentId: row.componentId, status: "OPERATIONAL", startedAt: cursor, endedAt: null, isMaintenance: false, note: "Seed baseline" });
  }
  await chunked(events, 1000, (c) => database.insertInto("componentStatusEvents").values(c).execute());

  // Hourly check + metric history for HISTORY_DAYS.
  const checks: Array<{ monitorId: string; checkedAt: Date; ok: boolean; latencyMs: number | null; statusCode: number | null; error: string | null }> = [];
  const points: Array<{ metricId: string; timestamp: Date; value: number }> = [];
  for (const row of monitorRows) {
    const windows = outages.get(row.componentId) ?? [];
    for (let hoursBack = HISTORY_DAYS * 24; hoursBack >= 1; hoursBack--) {
      const at = ago(hoursBack * HOUR + Math.floor(random() * 600_000));
      const down = !row.ok || windows.some((o) => !o.maintenance && at >= o.from && (!o.to || at <= o.to));
      const latency = Math.round(row.base * (0.7 + random() * 0.6) * (1 + 0.3 * Math.sin(hoursBack / 6)));
      checks.push({ monitorId: row.id, checkedAt: at, ok: !down, latencyMs: down ? null : latency, statusCode: down ? (row.ok ? 500 : 503) : 200, error: down ? "Unexpected status code" : null });
      if (row.metricId && !down) points.push({ metricId: row.metricId, timestamp: at, value: latency });
    }
  }
  await chunked(checks, 2000, (c) => database.insertInto("monitorChecks").values(c).execute());
  await chunked(points, 2000, (c) => database.insertInto("metricPoints").values(c).execute());

  // Subscribers (skipped for draft pages), custom metrics, announcements, analytics.
  const subscribers: Insertable<SignalHubDatabase["subscribers"]>[] = [];
  for (const [slug, page] of ids) {
    if (draftSlugs.has(slug)) continue;
    const componentIds = [...page.components.values()];
    const total = 6 + Math.floor(random() * 7);
    SUBSCRIBER_NAMES.slice(0, total).forEach((name, i) => {
      const sms = i % 5 === 4;
      subscribers.push({
        pageId: page.pageId, channel: sms ? "SMS" : "EMAIL",
        contact: sms ? `+1555${slug.length}${String(i).padStart(5, "0")}` : `${name}+${slug}@example.com`,
        componentIds: i % 3 === 0 ? [] : componentIds.slice(i % 4, (i % 4) + 3),
        eventTypes: [], verified: i % 6 !== 5, quarantined: i === 11, unsubscribeToken: randomBytes(32).toString("hex"),
        createdAt: ago((i + 1) * 9 * HOUR),
      });
    });
  }
  await chunked(subscribers, 500, (c) => database.insertInto("subscribers").values(c).execute());

  // One business metric per published page that is not tied to a monitor.
  let customMetrics = 0;
  for (const [slug, page] of ids) {
    if (draftSlugs.has(slug)) continue;
    const kind = CUSTOM_METRICS[customMetrics % CUSTOM_METRICS.length]!;
    const metric = await database.insertInto("metrics").values({
      pageId: page.pageId, componentId: null, name: kind.name, suffix: kind.suffix, description: kind.description, visible: true, decimals: kind.decimals,
    }).returning("id").executeTakeFirstOrThrow();
    await chunked(Array.from({ length: HISTORY_DAYS * 24 }, (_, i) => ({
      metricId: metric.id, timestamp: ago((HISTORY_DAYS * 24 - i) * HOUR),
      value: Number((kind.base * (1 + 0.25 * Math.sin(i / 8) + (random() - 0.5) * 0.2)).toFixed(kind.decimals)),
    })), 1000, (c) => database.insertInto("metricPoints").values(c).execute());
    customMetrics++;
  }

  const announcements = [
    ...ANNOUNCEMENTS.map((a) => ({ ...a, pageId: ids.get(a.page)!.pageId })),
    ...hubIds.map((hub) => ({ pageId: hub.id, title: "Welcome", body: "Every service in this hub is monitored continuously from public endpoints.", severity: "INFO" as const })),
    ...[...ids].filter((_, i) => i % 6 === 2).map(([slug, page]) => ({ pageId: page.pageId, title: "Scheduled improvements", body: `We are improving the ${slug} services this week.`, severity: "WARNING" as const })),
  ];
  for (const a of announcements) {
    await database.insertInto("pageAnnouncements").values({
      pageId: a.pageId, title: a.title, body: a.body, severity: a.severity,
      ctaLabel: null, ctaUrl: null, startsAt: ago(DAY), endsAt: ahead(7 * DAY), dismissible: true, priority: 0,
      surfaces: ["PAGE"], createdBy: admin.userId,
    }).execute();
  }

  const days = Array.from({ length: HISTORY_DAYS }, (_, i) => i);
  const analyticsTargets = [...[...ids].map(([slug, page]) => [slug, page.pageId] as const), ...hubIds.map((hub) => [hub.slug, hub.id] as const)];
  await database.insertInto("analyticsDaily").values(analyticsTargets.flatMap(([slug, pageId]) => days.map((d) => {
    const date = new Date(Date.now() - d * DAY).toISOString().slice(0, 10);
    const views = 120 + Math.floor(random() * 900);
    return {
      id: `${pageId}:${date}`, pageId, date, views, incidentViews: Math.floor(views * 0.2),
      subscriptionStarts: Math.floor(random() * 12), subscriptionCompletions: Math.floor(random() * 8),
      referrers: JSON.stringify({ direct: Math.floor(views * 0.6), "github.com": Math.floor(views * 0.2), [`${slug}.example.com`]: Math.floor(views * 0.1) }) as unknown as Record<string, number>,
      expiresAt: ahead(90 * DAY), updatedAt: new Date(),
    };
  }))).execute();

  printGeneratedSecrets("Demo seed", [{ label: "Password for PRIVATE page and AUDIENCE access users", value: sharedPassword }]);
  console.log(`Seeded ${hubIds.length} hubs, ${ids.size} status pages, ${monitorRows.length} monitors, ${INCIDENTS.length + generatedIncidents} incidents, ${MAINTENANCES.length + generatedMaintenances} maintenances, ${subscribers.length} subscribers, ${customMetrics} custom metrics, ${announcements.length} announcements, ${checks.length} checks, ${points.length} monitor metric points.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());

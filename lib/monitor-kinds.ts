/**
 * What the person wants to watch. The database keeps its seven check types; the form shows five kinds
 * and maps between them, so no migration is needed and existing monitors keep working.
 */
export type MonitorKind = "WEBSITE" | "PORT" | "PING" | "DNS" | "JOB";

export type MonitorKindInfo = {
  kind: MonitorKind;
  title: string;
  /** One line shown on the card. */
  description: string;
  /** First paragraph of the details dialog: what this kind is, in plain words. */
  overview: string;
  /** Shown in the details dialog. */
  whenToUse: string[];
  howToUse: string[];
  /** Every setting the form offers for this kind, in the order the form shows them. */
  settings: { name: string; text: string }[];
  /** Concrete things people watch with this kind. */
  examples: string[];
  goodToKnow: string[];
  troubleshooting: { problem: string; fix: string }[];
};

/** What happens after any check, whatever the kind. Shown at the end of every details dialog. */
export const AFTER_EVERY_CHECK: { name: string; text: string }[] = [
  { name: "Fails before down / OKs before recovered", text: "A single bad result does not flip the monitor. It goes down after this many failed checks in a row and recovers after this many good ones, which filters out one-off network blips." },
  { name: "Component status on failure", text: "The status the linked component shows while the monitor is down: degraded, partial outage or major outage." },
  { name: "Automated actions", text: "Per monitor, choose whether it flips the component status, records a response-time metric, opens and closes an incident on its own, and notifies subscribers." },
  { name: "Group and tags", text: "Use a monitor group to keep related monitors together in the list, and tags to filter and route them." },
];

export const MONITOR_KINDS: MonitorKindInfo[] = [
  {
    kind: "WEBSITE",
    title: "Website or API",
    description: "Request a URL and check the response, optionally for specific text.",
    overview:
      "SignalHub's worker sends an HTTP or HTTPS request to your URL at every interval and judges the answer: the status code, how long it took, and optionally what the body says. It is the most common monitor and the right default for anything with a web address.",
    whenToUse: [
      "A public website, a REST or GraphQL API, or a health endpoint that SignalHub can reach over HTTP or HTTPS.",
      "A page that can break while still answering 200, such as a maintenance banner or an error page. Use the content check to catch it.",
      "An endpoint behind authentication (Basic, Bearer, OAuth2, mTLS or a custom header).",
      "A site where you also want early warning before the HTTPS certificate or the domain registration expires.",
    ],
    howToUse: [
      "Paste the full URL, including https://.",
      "Pick the HTTP method. Keep the expected status at 200-299, or set the one your endpoint really returns.",
      "Optionally add a content check: text the body must contain, or text it must not contain.",
      "Optionally add authentication, a proxy, custom headers or a request body.",
      "Choose how often to check (every 10 seconds at the fastest) and which component the monitor reports to.",
    ],
    settings: [
      { name: "URL", text: "The address to request. Must include the scheme. Private and internal addresses are blocked unless the installation's operator allows them." },
      { name: "HTTP method", text: "GET by default. Use HEAD for a cheaper check, or POST and others when the endpoint needs them." },
      { name: "Expected status", text: "A code or range that counts as up. 200-299 by default." },
      { name: "Timeout (ms)", text: "How long to wait before the check counts as failed. 100 to 60000, default 10000." },
      { name: "Custom headers / Request body", text: "Extra headers and a body to send, for APIs that need an API key, a content type or a JSON payload." },
      { name: "Body must contain / must not contain", text: "A text match on the response body. Turns the check into a keyword monitor: the page must show a phrase, or must not show an error message." },
      { name: "Authentication type", text: "HTTP Basic, Bearer token, OAuth2 client credentials, mTLS client certificate, or a custom header. Secrets are stored encrypted and never shown again." },
      { name: "Proxy", text: "Send the request through one of your saved proxies, for targets only reachable from a particular network." },
      { name: "IP family", text: "Force IPv4 or IPv6, or leave it automatic." },
      { name: "Ignore TLS/SSL errors", text: "Accept an expired, self-signed or mismatched certificate. Use it for internal sites." },
      { name: "Skip caches", text: "Add a changing value to the URL so a CDN or cache cannot answer for your origin." },
      { name: "Save HTTP error response for notifications", text: "Keeps the start of a failing response so your webhooks can include it." },
      { name: "Upside-down mode", text: "Flips the result: up when the check fails. For something that should be unreachable, such as a closed admin page." },
      { name: "Certificate and domain expiry notification", text: "Warn a number of days before the HTTPS certificate or the domain registration runs out." },
    ],
    examples: [
      "https://example.com with the content check \"Add to cart\" to confirm the shop page really renders.",
      "https://api.example.com/health expecting 200, with a Bearer token.",
      "An admin URL in upside-down mode, to be alerted if it becomes publicly reachable.",
    ],
    goodToKnow: [
      "Follows up to 3 redirects. Only the target's own certificate is used for expiry, not the page a redirect lands on.",
      "The check runs from the SignalHub server, so it shows what that server sees, not what a visitor in another region sees.",
      "A 200 does not prove the page is right. Add a content check for anything important.",
      "Response time is recorded on every check when the metric action is on, which feeds the uptime and latency charts.",
    ],
    troubleshooting: [
      { problem: "Down with \"private address blocked\"", fix: "The target resolves to an internal IP. Ask the installation operator to allow it, or monitor a public address." },
      { problem: "Down with a certificate error", fix: "Fix or renew the certificate. For an internal site with a self-signed one, turn on Ignore TLS/SSL errors." },
      { problem: "Down with 401 or 403", fix: "Add the right authentication, or the header or key the endpoint expects." },
      { problem: "Up but the page is wrong", fix: "Add a Body must contain check for text that only appears on a healthy page." },
      { problem: "Flaps up and down", fix: "Raise Fails before down, or the timeout. A slow endpoint can need more than 10 seconds." },
    ],
  },
  {
    kind: "PORT",
    title: "Server port",
    description: "Open a connection to a host and port, optionally checking its TLS certificate.",
    overview:
      "SignalHub opens a TCP connection to a host and port and counts the monitor as up if the connection is accepted. With the certificate check on, it also completes a TLS handshake and reads the certificate's expiry date. Nothing is sent over the connection.",
    whenToUse: [
      "A database, cache, message queue, mail server, SSH or any service that listens on a TCP port but does not speak HTTP.",
      "A TLS service where you mainly care that its certificate does not expire: SMTPS, IMAPS, LDAPS or an internal HTTPS port.",
      "A load balancer or firewall rule that should keep a port open.",
    ],
    howToUse: [
      "Enter the host name or IP address and the port.",
      "For a TLS service (443, 465, 993 and similar), turn on Also check the TLS certificate and choose how many days of warning you want.",
      "A self-signed certificate works if you turn on Ignore TLS/SSL errors; the expiry date is still read.",
      "Set the interval and the component the monitor reports to.",
    ],
    settings: [
      { name: "Host", text: "A DNS name or an IP address. No scheme and no path." },
      { name: "Port", text: "1 to 65535. For example 5432 for PostgreSQL, 6379 for Redis, 22 for SSH, 25 for SMTP." },
      { name: "Also check the TLS certificate", text: "Turns the monitor into a TLS one: handshake, then read the expiry date of the certificate the server presents." },
      { name: "Warn before expiry (days)", text: "The monitor goes down once fewer days than this remain. 1 to 365. Leave empty to use the organization default from Settings." },
      { name: "Ignore TLS/SSL errors", text: "Accept an untrusted or mismatched certificate while still reading its expiry." },
      { name: "Timeout (ms)", text: "How long to wait for the connection before the check fails." },
    ],
    examples: [
      "db.internal.example.com on port 5432 to know the database accepts connections.",
      "mail.example.com on port 465 with the certificate check, warned 21 days before the certificate lapses.",
      "A bastion host on port 22.",
    ],
    goodToKnow: [
      "A plain port check only proves the connection opens. The service behind it could still be unhealthy. Use a website check when it speaks HTTP.",
      "With the certificate check on, a healthy connection still turns the monitor down when the certificate is within the warning window.",
      "Private and internal addresses are blocked unless the installation allows them.",
    ],
    troubleshooting: [
      { problem: "Down with connection refused or timed out", fix: "The port is closed or a firewall drops traffic from the SignalHub server. Allow its address." },
      { problem: "Certificate check fails on a service that starts TLS after a plain greeting (STARTTLS)", fix: "Use the implicit-TLS port (465, 993) or a plain port check; the certificate check expects TLS from the first byte." },
      { problem: "Wrong certificate shown", fix: "A server with several certificates picks by host name. Enter the exact name clients use." },
    ],
  },
  {
    kind: "PING",
    title: "Ping a host",
    description: "Send an ICMP ping and see whether the host answers.",
    overview:
      "SignalHub sends an ICMP echo request (a ping) to a host and counts the monitor as up when one reply arrives. It is the lowest-level check: it tells you the machine is reachable on the network, not that any service on it works.",
    whenToUse: [
      "Network devices, servers or gateways that expose no port you can test.",
      "A quick \"is the machine there at all\" signal underneath your other monitors, so you can tell a dead host from a dead application.",
      "Links and sites you want to watch for reachability and latency.",
    ],
    howToUse: [
      "Enter a host name or an IP address.",
      "Keep the timeout short; one reply is enough to count as up.",
      "Set the interval and the component the monitor reports to.",
    ],
    settings: [
      { name: "Host", text: "A DNS name or an IP address." },
      { name: "Timeout (ms)", text: "How long to wait for a reply before the attempt counts as lost." },
      { name: "IP family", text: "Force IPv4 or IPv6 when a name resolves to both." },
    ],
    examples: [
      "A router or VPN gateway at 192.168.1.1, if the installation allows internal addresses.",
      "A server's public IP, next to a website monitor, to tell \"host down\" from \"app down\".",
    ],
    goodToKnow: [
      "The installation's operator must enable ICMP, otherwise the check reports that ICMP is disabled.",
      "Many firewalls and cloud providers drop ping, so a healthy host can look down. Prefer a port or website check when you can.",
      "A reply says nothing about the services on the host.",
    ],
    troubleshooting: [
      { problem: "Reports that ICMP is disabled", fix: "Ask the operator to enable ICMP for this installation, or use a Server port check instead." },
      { problem: "Always down but the host is fine", fix: "The host or a firewall blocks ICMP. Switch to a Server port check on a port that is open." },
    ],
  },
  {
    kind: "DNS",
    title: "DNS record",
    description: "Resolve a record and check it still has the value you expect.",
    overview:
      "SignalHub resolves a DNS record for your domain and checks that it exists and, if you set one, that it contains the value you expect. Use it to notice a deleted, changed or hijacked record before your users do.",
    whenToUse: [
      "Catch a deleted or hijacked record, or a CNAME that no longer points where it should.",
      "Watch mail setup: MX records, or SPF and DKIM values in TXT records.",
      "Confirm a migration finished: an A record that must now point at the new server.",
      "Check delegation with NS records.",
    ],
    howToUse: [
      "Enter the domain name, for example example.com or mail.example.com.",
      "Pick the record type: A, AAAA, CNAME, MX, TXT or NS.",
      "Optionally enter the value you expect. The check passes when any returned record contains that text.",
      "Optionally turn on a domain expiry warning.",
    ],
    settings: [
      { name: "Domain name", text: "The name to resolve. No scheme and no path." },
      { name: "DNS record type", text: "A (IPv4), AAAA (IPv6), CNAME (alias), MX (mail), TXT (free text, SPF and verification) or NS (name servers)." },
      { name: "Expected value", text: "Text that must appear in at least one returned record. Leave empty to only check that the record exists." },
      { name: "Domain name expiry notification", text: "Warn a number of days before the domain registration runs out." },
    ],
    examples: [
      "example.com, type A, expected 203.0.113.10: alerts if the site moves unexpectedly.",
      "example.com, type TXT, expected v=spf1: alerts if the SPF record disappears.",
      "www.example.com, type CNAME, expected your CDN host name.",
    ],
    goodToKnow: [
      "Records are resolved from the worker, so results reflect what the SignalHub server's resolver sees. Cached answers can lag a recent change.",
      "The match is \"contains\", not \"equals\". A short expected value matches a longer record.",
      "With no expected value, the monitor only checks that the record exists.",
    ],
    troubleshooting: [
      { problem: "Down right after you changed a record", fix: "The old answer may still be cached until its TTL runs out. Wait, or raise Fails before down for the change window." },
      { problem: "Down on a TXT check", fix: "Some TXT values are split into quoted chunks. Use a short, distinctive part of the value." },
      { problem: "Record exists in your DNS panel but the check fails", fix: "Confirm the record type and the exact name, including any subdomain." },
    ],
  },
  {
    kind: "JOB",
    title: "Scheduled job or heartbeat",
    description: "Your job calls us when it runs; we alert you when it goes quiet.",
    overview:
      "Every other kind has SignalHub reach out to your system. A heartbeat is the reverse: your job, script or service calls a secret URL each time it runs, and SignalHub raises the alarm when the calls stop. Silence is the signal, so it catches jobs that die without an error.",
    whenToUse: [
      "Cron jobs, backups, imports, report runs and queue workers, especially behind a firewall or on a private network that SignalHub cannot reach.",
      "Anything that should happen every N minutes where \"nothing happened\" is the problem.",
      "A service that can only make outbound calls.",
    ],
    howToUse: [
      "Set the interval to how often your job runs, and a grace period for jobs that finish late.",
      "Add the monitor, then open it with the pencil icon and choose Create or rotate heartbeat URL. Copy the URL; it is shown once.",
      "At the end of your job, call the URL, for example curl -fsS <url>. GET and POST both work.",
      "Optionally require a username and password or a bearer token on top of the secret link.",
    ],
    settings: [
      { name: "Interval (seconds)", text: "How often your job is expected to call. 10 to 86400. Match it to the job's schedule." },
      { name: "Grace period (seconds)", text: "Extra time allowed after the interval before the monitor goes down. 0 to 86400, default 60. Set it above your job's normal run time." },
      { name: "Heartbeat URL", text: "The secret link your job calls. Created after you save the monitor. Rotating it stops the old URL at once." },
      { name: "Require authentication", text: "Also require HTTP Basic credentials or a Bearer token on every call. Calls without them get a 401. The secret is stored encrypted and never shown again." },
    ],
    examples: [
      "A nightly backup script that ends with curl -fsS <url>, on a 24 hour interval with a 30 minute grace period.",
      "A cron job every 5 minutes: crontab line ending in && curl -fsS <url>, so it only reports on success.",
      "A worker that calls the URL after each batch.",
    ],
    goodToKnow: [
      "The monitor goes down when no call arrives within the interval plus the grace period, and recovers on the next call.",
      "Put the call at the end of the job and chain it with && so a failed job stays silent and triggers the alert.",
      "Rotating the URL immediately stops the old one working. Update your job straight away.",
      "SignalHub never calls out for this kind, so there is nothing to allow-list on your side.",
    ],
    troubleshooting: [
      { problem: "Goes down although the job runs", fix: "The job takes longer than interval plus grace, or the call is not reached. Raise the grace period and run the curl by hand." },
      { problem: "Call returns 401", fix: "Credentials are required on this monitor. Send them, or turn off Require authentication." },
      { problem: "Call returns 404", fix: "The URL was rotated or mistyped. Create or rotate it again and update the job." },
      { problem: "No URL yet", fix: "It is created only after the monitor exists. Save, then open the monitor with the pencil icon." },
    ],
  },
];

const KIND_OF_TYPE: Record<string, MonitorKind> = {
  HTTP: "WEBSITE", KEYWORD: "WEBSITE", TCP: "PORT", TLS: "PORT", SSL: "PORT", ICMP: "PING", PING: "PING", DNS: "DNS", HEARTBEAT: "JOB",
};

export function kindOfType(type: string): MonitorKind {
  return KIND_OF_TYPE[type] ?? "WEBSITE";
}

/** The stored check type for a kind. Keyword checks are plain HTTP with a content check. */
export function typeForKind(kind: MonitorKind, checkCertificate = false) {
  switch (kind) {
    case "WEBSITE": return "HTTP";
    case "PORT": return checkCertificate ? "TLS" : "TCP";
    case "PING": return "ICMP";
    case "DNS": return "DNS";
    case "JOB": return "HEARTBEAT";
  }
}

/** A type may change only inside its own kind: Keyword to HTTP, TCP to TLS and back. */
export function sameKind(a: string, b: string) {
  return KIND_OF_TYPE[a] !== undefined && KIND_OF_TYPE[a] === KIND_OF_TYPE[b];
}

const TYPE_LABEL: Record<string, string> = {
  HTTP: "Website", KEYWORD: "Website", TCP: "Port", TLS: "Port + certificate", SSL: "Port + certificate",
  ICMP: "Ping", PING: "Ping", DNS: "DNS", HEARTBEAT: "Job",
};

/** Short label for the monitor list. */
export function monitorTypeLabel(type: string) {
  return TYPE_LABEL[type] ?? type;
}

/** TLS monitors saved before the port column was used keep the port inside an https:// target. */
export function hostAndPort(type: string, target: string, port: number | null) {
  if (kindOfType(type) !== "PORT" || !target.includes("://")) return { host: target, port };
  try {
    const url = new URL(target);
    return { host: url.hostname, port: port ?? (url.port ? Number(url.port) : 443) };
  } catch {
    return { host: target, port };
  }
}

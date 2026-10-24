# How SignalHub compares

An honest look at SignalHub next to the status-page and uptime tools people usually consider. **Checked 9 October 2026, re-checked 13 October 2026; incident.io added 19 October 2026.** The products and figures match the comparison on the SignalHub home page.

## Read this first

- **SignalHub's column** is based on what the code in this repository implements.
- **Competitor columns** come from public pricing/feature pages and third-party comparisons found on the date above. Vendors change plans often and aggregator sites disagree with each other (we found conflicting figures for several products), so treat every number as indicative and **confirm on the vendor's own pricing page** before deciding. A dash (—) means we did not verify the point and make no claim.
- We say where others are better. A comparison that only flatters the author is not useful.

## What SignalHub is, and is not

SignalHub is a **self-hosted** platform for status pages, monitoring and incident communication, built for teams that want to own their data and avoid per-subscriber or per-page pricing. It is **not** a hosted service: you run PostgreSQL, a web process and a worker, and you operate them.

## Feature matrix

| | SignalHub | Atlassian Statuspage | Better Stack | Instatus | incident.io |
|---|---|---|---|---|---|
| 1,000 subscribers | $0 | ≈ $99 a month | $0, free tier | $20 a month | $0, Basic plan |
| 5,000 subscribers | $0 | ≈ $399 a month | $160 a month | $20 a month | $0, Basic plan |
| 25,000 subscribers | $0 | ≈ $1,499 a month | $960 a month | ≈ $300 a month, unofficial | $0, Basic plan |
| Price grows with subscribers | No | Yes | Yes | Yes | No, $19 per user |
| Delivery | Self-hosted | SaaS | SaaS | SaaS | SaaS |
| License | Apache-2.0 | Proprietary | Proprietary | Proprietary | Proprietary |
| Data stays on your infrastructure | ✅ | ❌ | ❌ | ❌ | ❌ |
| Built-in monitoring | 7 types | ❌ | ✅ | ✅ | Alerts from your tools |
| Subscriber email, SMS and webhooks | ✅ | Capped by plan | Add-ons past 1,000 | Capped by plan | Email, Slack and RSS |
| Private and audience pages | ✅ | Separate plans from ≈ $79 | $50 per page | Business tier | Pro and Enterprise |
| SAML, OIDC and SCIM | ✅ | Paid tiers | $250 per page | Business tier | SAML on Pro, SCIM on Enterprise |
| Many organizations on one install | ✅ | n/a | n/a | n/a | n/a |
| Hash-chained audit log and SIEM | ✅ | — | — | — | Audit logs on Enterprise |
| Role-based access control | 4 roles, per-page limits | ✅ | Responder seats | ✅ | — |
| Multi-region probes | No, checks run from your worker | — | — | — | — |
| Translated interface | No, English only | — | — | — | — |
| Actively maintained | ✅ | ✅ | ✅ | ✅ | ✅ |

Legend: ✅ supported · ❌ not supported · — not verified, no claim · n/a not applicable.

## Cost

SignalHub has **no license fee, no per-seat, per-page or per-subscriber charge.** You pay for the infrastructure you run it on and for the email/SMS provider you choose. A small VPS (roughly 2 vCPU / 2–4 GB RAM) plus PostgreSQL is enough to start; typical small-VPS pricing is in the low tens of dollars per month, but your provider and region decide, and we have not benchmarked every workload. Add your own time for patching, backups and monitoring the monitor.

Indicative published SaaS prices for a **public** page (monthly, list price, USD):

| Product | Entry tier | Mid tier | Scale tier | Notes |
|---|---|---|---|---|
| SignalHub | $0 license | $0 license | $0 license | Infrastructure and email/SMS provider costs only |
| Atlassian Statuspage | Hobby ≈ $29 (250 subscribers) | Startup ≈ $99 (1,000) or Business ≈ $399 (5,000) | Enterprise ≈ $1,499 (25,000) | Free plan: 100 subscribers. Private pages are separate plans starting around $79 (50 authenticated users) |
| Better Stack | Free tier: 1 status page, 1,000 subscribers | Extra public pages $15 ($12 yearly) each; password protection $50 per page ($42 yearly) | Extra subscribers $40 per 1,000; SSO $250 per page ($208 yearly) | Priced a la carte, from the official pricing page |
| Instatus | Pro from $20 (5,000 subscribers) | n/a | Business: 25,000 subscribers, all page types, SAML SSO. Third parties put it near $300; the official page shows no figure | Free Starter: 200 subscribers. Enterprise is a custom contract |
| incident.io | Basic: free, 1 public page, unlimited subscribers | Team $19 per user ($15 yearly); on-call +$10 per user | Pro $25 per user; Enterprise custom | Priced per responder, not per subscriber. Internal page on Pro; customer pages, sub-pages and audit logs on Enterprise |

**Worked example.** A SaaS company with 8,000 subscribers needing private pages and SSO would be on a top public tier or Enterprise at the vendors above, and a private/audience add-on on top. The same load on SignalHub costs the infrastructure it runs on, plus whatever your email provider charges per message.

### Sources (checked 9 and 13 October 2026; incident.io 19 October 2026)

On 13 October 2026 the Statuspage, Instatus and Better Stack figures above were confirmed against their official pricing pages. Instatus now shows no Business price, so that number is marked as third-party.

Official pricing pages (authoritative; check these):
[Atlassian Statuspage](https://www.atlassian.com/software/statuspage/pricing) ·
[Instatus](https://instatus.com/pricing) ·
[Better Stack](https://betterstack.com/pricing) ·
[incident.io](https://incident.io/pricing) ·
[incident.io status page subscriptions](https://docs.incident.io/status-pages/internal-vs-public-subscriptions)

Third-party comparisons used where official pages were not retrievable:
[Statuspage pricing (Capterra)](https://www.capterra.com/p/177360/Statuspage/) ·
[Statuspage pricing (Hyperping)](https://hyperping.com/blog/statuspage-pricing) ·
[Better Stack pricing (Hyperping)](https://hyperping.com/blog/betterstack-pricing) ·
[Instatus pricing (Hyperping)](https://hyperping.com/blog/instatus-pricing)

## When another tool is the better choice

- **You don't want to run anything.** A hosted product (Statuspage, Instatus, Better Stack) removes operations work. SignalHub is for teams that accept that trade for control and cost.
- **You need probes from many regions.** SignalHub checks from wherever your worker runs. Run workers in several places or use a hosted monitor, then push results in with the status API or heartbeat/webhook endpoints.
- **You need a translated status page.** SignalHub's UI is English only today.
- **You only need a personal monitor with a simple public page.** Uptime Kuma or Gatus are lighter if you don't need subscribers, multi-tenancy, SSO or audit.
- **You need certified compliance reports from your vendor.** Self-hosting makes controls possible; it does not produce a vendor attestation.

## Where SignalHub is strongest

- **Own your data and your bill.** Subscribers, incidents and audit history never leave your infrastructure, and cost doesn't scale with subscriber count.
- **Enterprise identity included**: SAML, OIDC, SCIM, MFA, RBAC and audience-restricted pages are not locked behind a top tier.
- **One product for page, monitors and communication**: monitors flip component status, open incidents and notify subscribers automatically.
- **Auditability**: hash-chained audit log, SIEM delivery, org export and retention controls.
- **Simple to run**: one PostgreSQL database plus a web and a worker process; Docker Compose included.

See the [feature list in the README](../README.md#-features) and [security and data protection](security.md).

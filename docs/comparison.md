# How SignalHub compares

An honest look at SignalHub next to the status-page and uptime tools people usually consider. **Snapshot taken 9 October 2026.**

## Read this first

- **SignalHub's column** is based on what the code in this repository implements.
- **Competitor columns** come from public pricing/feature pages and third-party comparisons found on the date above. Vendors change plans often and aggregator sites disagree with each other (we found conflicting figures for several products), so treat every number as indicative and **confirm on the vendor's own pricing page** before deciding. `n/v` means we did not verify the point and make no claim.
- We say where others are better. A comparison that only flatters the author is not useful.

## What SignalHub is, and is not

SignalHub is a **self-hosted** platform for status pages, monitoring and incident communication, built for teams that want to own their data and avoid per-subscriber or per-page pricing. It is **not** a hosted service: you run PostgreSQL, a web process and a worker, and you operate them.

## Feature matrix

| | **SignalHub** | Atlassian Statuspage | Better Stack | Instatus | StatusCake | Uptime Kuma | Cachet | Gatus |
|---|---|---|---|---|---|---|---|---|
| Delivery model | Self-hosted | SaaS | SaaS | SaaS | SaaS | Self-hosted | Self-hosted | Self-hosted |
| License | Apache-2.0 | Proprietary | Proprietary | Proprietary | Proprietary | MIT | Open source | Apache-2.0 |
| Your data stays on your infrastructure | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Built-in monitoring | ✅ 7 types | ❌ status page product | ✅ | ✅ | ✅ core product | ✅ | n/v | ✅ core product |
| Subscriber notifications (email/SMS/webhook) | ✅ | ✅ capped by plan | ✅ 1,000 included, add-ons beyond | ✅ capped by plan | n/v | ❌ no native subscriber notifications | ✅ email | ❌ alerts your team only |
| Private / audience-restricted pages | ✅ password + user/group audiences | ✅ separate, higher-priced plans | ✅ add-on | ✅ Business tier | n/v | n/v | n/v | n/v |
| SAML SSO | ✅ plus OIDC and SCIM | Paid tiers | Add-on | Business tier | n/v | n/v (single user, no RBAC) | n/v | n/v |
| Role-based access control | ✅ 4 roles + per-page limits | ✅ | ✅ responder seats | ✅ | n/v | ❌ single user | n/v | n/v |
| Several organizations on one install | ✅ | n/a | n/a | n/a | n/a | n/v | n/v | n/v |
| Hash-chained audit log + SIEM delivery | ✅ | n/v | n/v | n/v | n/v | n/v | n/v | n/v |
| Multi-region probes | ❌ checks run from your worker | n/v | n/v | n/v | n/v | n/v | n/v | n/v |
| Translated UI | ❌ English only | n/v | n/v | n/v | n/v | ✅ multi-language | ✅ multi-lingual | n/v |
| Actively maintained | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ v2.4.0, June 2026 | ⚠️ 2.x last released 2023; 3.x rewrite in progress per third parties | ✅ |

Legend: ✅ supported · ❌ not supported · n/v not verified, no claim · n/a not applicable.

## Cost

SignalHub has **no license fee, no per-seat, per-page or per-subscriber charge.** You pay for the infrastructure you run it on and for the email/SMS provider you choose. A small VPS (roughly 2 vCPU / 2–4 GB RAM) plus PostgreSQL is enough to start; typical small-VPS pricing is in the low tens of dollars per month, but your provider and region decide, and we have not benchmarked every workload. Add your own time for patching, backups and monitoring the monitor.

Indicative published SaaS prices for a **public** page (monthly, list price, USD):

| Product | Entry paid tier | Mid tier | Scale tier | Notes |
|---|---|---|---|---|
| **SignalHub** | $0 license | $0 license | $0 license | Infrastructure + email/SMS provider costs only |
| Atlassian Statuspage | Hobby ≈ $29 (250 subscribers) | Startup ≈ $99 (1,000) / Business ≈ $399 (5,000) | Enterprise ≈ $1,499 (25,000) | Free plan: 100 subscribers. Private pages are separate plans starting around $79 (50 authenticated users) |
| Instatus | Pro ≈ $20 (5,000 subscribers, custom domain, 50 monitors) | n/a | Business ≈ $300 (25,000 subscribers, private pages, SAML SSO) | Free Starter: 200 subscribers. Some sources also mention an intermediate private-page plan |
| Better Stack | Free tier (1 status page, 10 monitors) | Modular: extra pages ≈ $12 each; custom CSS/JS and password protection/SSO are per-page add-ons | Extra subscribers ≈ $40 per additional 1,000 (per one source) | Pricing is a la carte; third-party estimates for a growing team range widely |
| StatusCake | Free (10 monitors) / Superior ≈ $20–25 | Business ≈ $67–80 | Custom | Sources disagree on which plans include a status page |
| Uptime Kuma, Cachet, Gatus | $0 license | $0 | $0 | Self-hosted, you run them |

**Worked example.** A SaaS company with 8,000 subscribers needing private pages and SSO would be on a top public tier or Enterprise at the vendors above, and a private/audience add-on on top. The same load on SignalHub costs the infrastructure it runs on, plus whatever your email provider charges per message.

### Sources (checked 9 October 2026)

Official pricing pages (authoritative; check these):
[Atlassian Statuspage](https://www.atlassian.com/software/statuspage/pricing) ·
[Instatus](https://instatus.com/pricing) ·
[Better Stack](https://betterstack.com/pricing) ·
[StatusCake](https://www.statuscake.com/pricing/)

Third-party comparisons used where official pages were not retrievable:
[Statuspage pricing (Capterra)](https://www.capterra.com/p/177360/Statuspage/) ·
[Statuspage pricing (Hyperping)](https://hyperping.com/blog/statuspage-pricing) ·
[Better Stack pricing (Hyperping)](https://hyperping.com/blog/betterstack-pricing) ·
[Instatus pricing (Hyperping)](https://hyperping.com/blog/instatus-pricing) ·
[StatusCake comparison (Better Stack)](https://betterstack.com/community/comparisons/better-stack-vs-statuscake/) ·
[Statuspage vs Uptime Kuma (Better Stack)](https://betterstack.com/community/comparisons/statuspage-vs-uptime-kuma/) ·
[Uptime Kuma releases](https://github.com/louislam/uptime-kuma/releases) ·
[Cachet](https://github.com/cachethq/cachet) ·
[Gatus](https://github.com/TwiN/gatus)

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

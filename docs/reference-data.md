# Estora reference data and screenshots

**All images are for reference only.** Screenshots use a local SignalHub installation and the Estora development organization. Synthetic incidents, monitor results, metric points, traffic, subscribers and destinations illustrate the product. They are not reports of real Estora service availability, production incidents, customer adoption or performance.

## Dataset

The retained screenshots were captured from an Estora development installation containing synthetic `[Reference]` records:

| Area | Reference examples |
|---|---|
| Pages | Estora service hub, operational platform page, private operations page and audience-specific partner page. |
| Services | Seven payment infrastructure services on Payment Health and seven on the reference platform page, with a 90-day synthetic baseline. |
| Monitoring | HTTP, Keyword, TCP, DNS, TLS, ICMP and Heartbeat examples; 168 synthetic hourly results and latency points per type. |
| Events | Investigating, Identified, Monitoring and Resolved incidents; historical disruptions; Scheduled, In progress, Verifying and Completed maintenance; one hidden internal incident. |
| Audience | Twelve sample email subscribers, including an example quarantine state. All remain unverified. |
| Destinations | Two disabled sample destinations: Slack and webhook. |
| People | Three disabled synthetic accounts with page-scoped Incident Manager, Responder and Viewer roles. |
| Audit | A truthful reference-data creation event, written through the normal audit writer and filtered for screenshots. |
| Analytics | Thirty days of simulated aggregates on the Estora platform reference page. |

Reference monitors were kept paused with automation/notification actions disabled, and destination URLs used reserved example domains. The screenshots illustrate product workflows; a new installation does not include these records.

## Recreate the examples

Use the [setup guide](OPEN_SOURCE_SETUP_GUIDE.md) to create a disposable local installation, then create synthetic organizations, pages, services, and incidents through the console. Use reserved example domains and keep reference monitors paused and delivery destinations disabled. Sample-data generators and screenshot-specific database fixture tools are not included in the application repository.

## Capture and publish

Use the Estora organization in a signed-in development session. Capture actual rendered screens after the page has loaded. Hide the Next.js development indicator through its Preferences menu, and avoid usable credentials, one-time codes and customer data. Filter platform-wide people and audit views to synthetic Estora records. Setup and authentication screens are installation flows rather than organization-specific pages.

Setup and MFA references use a separate local database with synthetic Estora accounts and independent application keys. After capture, every account is disabled, sessions and authenticator/recovery material are removed, and pending removal requests are closed before images are copied into the public website. Any QR code or setup key visible in an enrollment reference is therefore retired. Recovery-code lists are omitted; the guide shows the regeneration confirmation instead. The subscription example shows the actual worker-unavailable state; email and SMS entry require a healthy delivery worker and a configured provider.

Native browser captures are local authoring inputs and are excluded from Git. Create `docs/captures/estora/` for new captures, or set `CAPTURE_SOURCE_DIR` to an external capture folder. Product PNGs in `docs/screenshots/` illustrate the repository guides. Marketing-only `landing-*` captures are skipped by the application screenshot tool.

Refresh the repository screenshots and their index from this application checkout:

```sh
node scripts/docs/sync-screenshots.mjs
```

This command writes only to `docs/screenshots/` in the application repository. The [public website](https://signalhub.at/) and its [documentation](https://signalhub.at/docs/) own their HTML and screenshot assets independently; see [project separation](landing-page.md).

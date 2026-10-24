# Website and application workspace

SignalHub uses two independent projects. This `status` checkout contains the application, worker, repository guides, and their screenshots. The separate `signalhub.at` checkout contains the public marketing website, online documentation, interactive demos, and website assets.

## Public website

The website is published at [signalhub.at](https://signalhub.at/). Its [user manual](https://signalhub.at/docs/user-manual.html) and [documentation index](https://signalhub.at/docs/) are served by that project. The application's Help page links to the online manual, which requires internet access; built-in help articles remain in the application.

The website has its own Git history and deployment instructions. Refer to its README for publishing or previewing it. It does not run the application, worker, database, or authentication services.

## Documentation ownership

The application keeps installation, configuration, security, operations, and contributor guides in this repository. Product screenshots in `docs/screenshots/` support the README and those guides. Public HTML documentation and demo assets belong to the website project and are maintained there independently.

Application builds do not bundle the public website or manual. Application authoring scripts do not write to the website checkout. For new repository screenshots, use clean Estora reference data and run `node scripts/docs/sync-screenshots.mjs`; this updates only `docs/screenshots/` here. See the [reference-data notes](reference-data.md).

## Installed application homepage

The application's `/` route is a workspace welcome screen with installation branding and a **Sign in to workspace** action. It contains no marketing page, public service directory, incident list, or operational counts.

![Application workspace welcome](screenshots/application-workspace.png)

Signed-in visitors go to `/organization`. A new installation still opens the setup wizard first. Individual public status pages keep their own URLs and access policies.

### Installation branding

```dotenv
SIGNALHUB_INSTANCE_NAME=Estora Operations
SIGNALHUB_INSTANCE_LOGO_URL=https://example.com/logo.svg
```

Blank values use the SignalHub name and mark. The logo accepts HTTP(S) URLs and uploaded `/api/assets/<uuid>` URLs. Set these in the application environment or Compose `.env`, then restart it. They do not change the separate marketing website. See [configuration](configuration.md#application-homepage-branding).

## Ownership map

| Application project | Website project |
|---|---|
| Next.js application and worker | Landing page and interactive demos |
| Database, credentials, runtime configuration | Static public content only |
| Repository Markdown guides | Online HTML documentation and user manual |
| Repository PNG screenshots and reference-data tools | Website-owned screenshot assets, fonts, and sharing artwork |
| Application build and deployment | Independent static-site deployment |

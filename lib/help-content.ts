export type HelpArticle = {
  slug: string;
  title: string;
  summary: string;
  body: HelpSection[];
};

export type HelpSection = { heading: string; paragraphs: string[]; list?: string[]; code?: string };

export type HelpCategory = {
  slug: string;
  label: string;
  icon: string;
  articles: HelpArticle[];
};

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    slug: "overview",
    label: "Overview",
    icon: "◧",
    articles: [
      {
        slug: "dashboard",
        title: "Dashboard",
        summary: "Your organization's home screen — page count, open incidents, upcoming maintenance at a glance.",
        body: [
          {
            heading: "What you see here",
            paragraphs: [
              "The Dashboard summarizes your whole organization in four numbers: total pages, total components across those pages, total subscribers, and upcoming maintenance windows.",
              "Below that, two lists: Open Incidents (anything not yet Resolved, across every page) and Your Pages (quick View/Manage links).",
            ],
          },
          {
            heading: "Common tasks",
            paragraphs: ["Jump to an open incident to post an update, or click Manage on a page to edit its components and settings."],
          },
        ],
      },
      {
        slug: "pages",
        title: "Pages",
        summary: "Create, list, and manage every status page your organization publishes.",
        body: [
          {
            heading: "Creating a page",
            paragraphs: [
              "Go to Pages → Create page, choose Status page or Hub, then enter the name, optional custom slug, and visibility. Status pages can optionally belong to an existing hub.",
              "The first save creates a hidden draft. Complete branding, components or child pages, access, notifications, and webhooks on the unified creation screen, then select Finish & publish.",
            ],
          },
          {
            heading: "Page types",
            paragraphs: [],
            list: [
              "Public — anyone with the URL can view it.",
              "Private — requires a shared password to view.",
              "Audience-specific — each visitor logs in and sees only the components assigned to their user or group.",
              "Hub — aggregates several child pages into one directory-style landing page.",
            ],
          },
          {
            heading: "Managing a page",
            paragraphs: [
              "Click Manage to edit branding (layout, logo, and brand color), components and component groups, and — for Audience pages — access groups and users.",
              "Draft pages show Continue setup. Published pages show Manage page for ongoing changes.",
            ],
          },
        ],
      },
      {
        slug: "analytics",
        title: "Analytics",
        summary: "Understand status-page visits, subscriber activity, and public engagement without exposing visitor identities.",
        body: [
          {
            heading: "Reading the dashboard",
            paragraphs: [
              "Use Analytics to compare page views, unique sessions, subscription events, and traffic over time. Select a page and date range before drawing conclusions from the totals.",
              "Public analytics are operational signals rather than billing-grade measurements. Privacy controls, blocked scripts, and cached status responses can affect counts.",
            ],
          },
          {
            heading: "Using the data",
            paragraphs: ["Watch for traffic spikes during incidents, verify that subscription calls to action are working, and compare engagement before and after a page redesign."],
          },
        ],
      },
      {
        slug: "audit-log",
        title: "Audit Log",
        summary: "A read-only history of every admin action taken in your organization.",
        body: [
          {
            heading: "What's recorded",
            paragraphs: [
              "Every meaningful admin action — creating or deleting a page, changing settings, creating or removing a user, switching organizations, or revoking an API key — writes one entry here with who did it and when.",
              "The log shows the 200 most recent entries, newest first. It cannot be edited or deleted from the UI.",
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "incidents",
    label: "Incidents",
    icon: "!",
    articles: [
      {
        slug: "incidents",
        title: "Incidents",
        summary: "Declare, update, and resolve incidents — the core of what your status page communicates.",
        body: [
          {
            heading: "The lifecycle",
            paragraphs: [
              "An incident moves through four statuses: Investigating → Identified → Monitoring → Resolved. Each status change is a timestamped update that appears on your public page.",
            ],
          },
          {
            heading: "Declaring an incident",
            paragraphs: [
              "Go to Incidents → Declare Incident. Pick the page, name it, choose impact (None/Minor/Major/Critical), select affected components and their new status, write the first update, and choose whether to notify subscribers.",
              "Check 'Backfill an incident that happened in the past' if you're logging something retroactively — this skips subscriber notifications by default.",
            ],
          },
          {
            heading: "Posting updates",
            paragraphs: [
              "Open an incident's detail page to post further updates, change its status, or (once Resolved) write and publish a postmortem.",
              "Affected component status is reconciled against every remaining incident, maintenance window, monitor, and manual override when an incident resolves.",
            ],
          },
        ],
      },
      {
        slug: "timeline-and-postmortems",
        title: "Timeline and postmortems",
        summary: "Edit public incident updates, maintain an accurate line-and-dot timeline, and publish a durable retrospective.",
        body: [
          {
            heading: "Editing timeline entries",
            paragraphs: [
              "Open an incident and use the timeline editor to correct an update's public status or message. Editing historical content does not silently change the incident's current lifecycle state.",
              "The public incident page renders updates chronologically with a vertical rail and status dots. Keep each entry concise, customer-facing, and specific about what changed.",
            ],
          },
          {
            heading: "Writing a postmortem",
            paragraphs: [
              "After resolution, document the impact, root cause, recovery, and preventive actions. Publish only when the content is ready for customers; drafts remain private to administrators.",
            ],
            list: [
              "State customer impact before internal technical detail.",
              "Use exact times and avoid unsupported certainty.",
              "List owned follow-up actions and expected completion windows.",
            ],
          },
        ],
      },
      {
        slug: "maintenance",
        title: "Maintenance",
        summary: "Schedule planned downtime windows that automatically start and complete on time.",
        body: [
          {
            heading: "Scheduling a window",
            paragraphs: [
              "Go to Maintenance → Schedule Maintenance. Pick the page, name, a start time, and a duration. Select affected components and the status they should show during the window (usually Under Maintenance).",
              "Enable auto-transition and the window will flip to In Progress at the start time and Completed at the end time automatically — no one has to remember to update it.",
            ],
          },
          {
            heading: "Where it shows up",
            paragraphs: [
              "Scheduled (future) maintenance appears in its own section on the public page. Once In Progress, it behaves like an active incident with the maintenance badge.",
            ],
          },
        ],
      },
      {
        slug: "templates",
        title: "Templates",
        summary: "Reusable incident/maintenance boilerplate so you're not retyping the same message every time.",
        body: [
          {
            heading: "Why use templates",
            paragraphs: [
              "If you frequently see the same kind of incident (e.g. 'Elevated error rates on X'), save it as a template: default status, impact, affected components, and message body.",
            ],
          },
          {
            heading: "Creating one",
            paragraphs: [
              "Go to Templates → optionally create a Template Group to organize related templates → New Template with title, body (use {{component}} as a placeholder), default status/impact, and default affected components.",
              "Templates appear in the 'Apply template' dropdown when declaring a new incident.",
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "communicate",
    label: "Communicate",
    icon: "@",
    articles: [
      {
        slug: "subscribers",
        title: "Subscribers",
        summary: "Verified email subscribers, feeds, and administrator-managed webhook integrations.",
        body: [
          {
            heading: "Channels supported",
            paragraphs: [],
            list: [
              "Email — verified via a one-time code sent to the inbox.",
              "Slack — posts to a channel via an incoming webhook URL.",
              "Microsoft Teams — posts to a channel via an incoming webhook URL.",
              "Webhook — signs and POSTs every event as JSON to a verified HTTPS endpoint.",
              "RSS and Atom — public feeds, or revocable signed feed URLs for protected pages.",
            ],
          },
          {
            heading: "Adding subscribers",
            paragraphs: [
              "Visitors verify email subscriptions with a one-time code. Administrators manage Slack, Teams, and generic webhook integrations separately and can bulk-import email addresses.",
              "Quarantine a subscriber to stop notifications without deleting them; Export CSV downloads the full list for a page.",
            ],
          },
        ],
      },
      {
        slug: "destinations",
        title: "Notifications and destinations",
        summary: "Configure subscriber delivery, tested team destinations, and signed outbound webhooks for each page.",
        body: [
          {
            heading: "Delivery readiness",
            paragraphs: [
              "The Destinations screen shows whether Email, SMS, RSS, and Atom are available. Email and SMS require both a configured provider and a healthy delivery worker; feeds remain available without the worker.",
              "Only destination providers enabled by a platform administrator appear. Slack, Teams, and similar team destinations are tested before their credentials are stored.",
            ],
          },
          {
            heading: "Signed status-event webhooks",
            paragraphs: [
              "Register a verified HTTPS endpoint to receive incident, maintenance, and postmortem events. SignalHub signs deliveries with the endpoint secret and retries transient failures.",
              "Copy a newly issued secret immediately, store it in a secret manager, verify signatures against the raw request body, and rotate the secret if it may have been exposed.",
            ],
          },
          {
            heading: "Troubleshooting",
            paragraphs: ["If delivery is paused, check the worker status first, then the provider readiness message, destination verification state, and last recorded error."],
          },
        ],
      },
      {
        slug: "metrics",
        title: "Metrics",
        summary: "Time-series charts (response time, uptime %, or anything numeric) shown publicly on your status page.",
        body: [
          {
            heading: "Creating a metric",
            paragraphs: [
              "Go to Metrics → Add Metric. Give it a name, an optional unit suffix (ms, %, s, req/s, MB — any free text), and optionally link it to a component.",
              "The suffix field is unrestricted — type whatever unit makes sense for the number you're charting.",
            ],
          },
          {
            heading: "Pushing data",
            paragraphs: [
              "Push a single point manually from the Metrics page, or automate it via POST /api/v1/manage/metrics/<id>/points using an API key.",
              "A metric only appears on the public page once it has at least one data point, under the 'System Metrics' section.",
            ],
          },
        ],
      },
      {
        slug: "embed",
        title: "SignalHub Embed",
        summary: "A small script tag that shows an auto-appearing incident banner on your own website.",
        body: [
          {
            heading: "How it works",
            paragraphs: [
              "Go to SignalHub Embed, pick a page, and copy the generated <script> tag into your site. It stays invisible during normal operation and automatically shows a floating banner when there's an active incident or maintenance window.",
              "A static status badge snippet is also provided if you'd rather show an always-visible 'All Systems Operational' link.",
            ],
          },
        ],
      },
      {
        slug: "monitors",
        title: "Monitors",
        summary: "Run HTTP, TCP, DNS, and heartbeat checks with thresholds, history, and optional component automation.",
        body: [
          {
            heading: "Creating a check",
            paragraphs: [
              "Choose the page, monitor type, target, interval, timeout, and optional component. HTTP monitors can validate status and response behavior; TCP and DNS checks validate reachability; heartbeat monitors expect your system to call a generated URL.",
              "Failure and recovery thresholds prevent one transient result from flipping public status. A monitor changes state only after the configured number of consecutive outcomes.",
            ],
          },
          {
            heading: "Worker health",
            paragraphs: [
              "Checks, automatic maintenance transitions, and queued notifications run in the worker process. If the Monitors screen reports a stale or offline worker, fix worker health before interpreting missing checks as service health.",
            ],
          },
          {
            heading: "Safe automation",
            paragraphs: [
              "Linking a component lets monitor state participate in effective component status. Incidents, maintenance, manual status, and other monitors are reconciled together, so recovery from one source does not incorrectly clear another active outage.",
              "Use Check on next poll for validation, inspect recent check history and latency, then enable automated actions only after thresholds behave as expected.",
            ],
          },
        ],
      },
      {
        slug: "third-party",
        title: "Monitor Templates",
        summary: "Start a real worker-backed check from a curated, editable monitor configuration.",
        body: [
          {
            heading: "Why use a template",
            paragraphs: [
              "If your service depends on a provider with a stable public status endpoint, add its template to create a component and enabled availability monitor together.",
              "Templates are deliberately curated. Providers without a stable check endpoint are omitted instead of pretending to monitor them.",
            ],
          },
          {
            heading: "Adding one",
            paragraphs: [
              "Create the component on its page, then use Monitors to configure its target, interval, assertions, thresholds, and automated actions.",
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "organization",
    label: "Organization",
    icon: "◐",
    articles: [
      {
        slug: "team",
        title: "Users and roles",
        summary: "Create active organization users and control what they can do with roles.",
        body: [
          {
            heading: "Roles",
            paragraphs: [],
            list: [
              "OWNER — identity policy, ownership changes, and every organization administrative capability.",
              "ADMIN — team, pages, integrations, and organization configuration without ownership transfer authority.",
              "RESPONDER — incidents, maintenance, monitors, metrics, and component status.",
            ],
          },
          {
            heading: "Creating a user",
            paragraphs: [
              "Go to Users & Roles, enter the user's name, email, role, page scope, and a temporary password for a new local identity. The membership becomes active immediately and a new local user must change the temporary password at first sign-in. Existing password or SSO identities keep their current authentication. Owners and Admins can create users; only an Owner can grant ownership, and the last enabled active Owner can never be removed or demoted.",
            ],
          },
        ],
      },
      {
        slug: "security",
        title: "Security",
        summary: "Manage local password policy, MFA, SSO connections, SCIM provisioning, sessions, and organization access controls.",
        body: [
          {
            heading: "Authentication policy",
            paragraphs: [
              "Use Security to review allowed sign-in methods and identity connections. Changes affect how organization members authenticate, so keep at least one tested administrator path available while configuring SSO.",
              "New local users receive a temporary password and must change it at first sign-in. Existing SSO or password identities retain their configured authentication method.",
            ],
          },
          {
            heading: "SSO and SCIM",
            paragraphs: [
              "Configure OIDC or SAML with the callback and metadata values displayed by SignalHub, then test the connection before enforcing it. SCIM tokens are credentials: copy them once, store them securely, scope them to the intended connection, and rotate them after exposure.",
            ],
          },
          {
            heading: "Sessions and incident response",
            paragraphs: [
              "Review active sessions, revoke suspicious or stale sessions, rotate affected API and webhook secrets, and use the Audit Log to reconstruct administrative changes. Organization suspension immediately fences tenant mutations and automation.",
            ],
          },
        ],
      },
      {
        slug: "api-keys",
        title: "API Keys",
        summary: "Bearer tokens for the management API, plus outbound webhook endpoints per page.",
        body: [
          {
            heading: "Management API keys",
            paragraphs: [
              "Generate a key here, then authenticate requests to /api/v1/manage/* with Authorization: Bearer <key>. Everything the console does — creating incidents, updating component status, pushing metric points — is also available as an API call.",
              "Revoking a key takes effect immediately.",
            ],
          },
          {
            heading: "Outbound webhooks",
            paragraphs: [
              "Separately, each page can register webhook endpoints that receive a real HTTP POST for every incident/maintenance/postmortem event, signed with a per-endpoint secret.",
            ],
          },
        ],
      },
      {
        slug: "settings",
        title: "Settings",
        summary: "Organization name, contact email, and the platform-managed deletion process.",
        body: [
          {
            heading: "General settings",
            paragraphs: ["Update your organization's display name and optional operational contact email. Owners and Admins can change these."],
          },
          {
            heading: "Deleting the organization",
            paragraphs: [
              "Contact your platform operator with the organization slug. A platform Owner must suspend the tenant, reauthenticate, and queue the retryable purge; the console preserves the request, job, and tombstone audit evidence.",
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "page-settings",
    label: "Inside a Page",
    icon: "▦",
    articles: [
      {
        slug: "designer-and-saving",
        title: "Designer, saving, and versions",
        summary: "Build page layouts, preview templates and themes, save changes live, restore versions, and reset defaults.",
        body: [
          {
            heading: "Workspace layout",
            paragraphs: [
              "The designer uses a two-pane workspace. Branding, page settings, block controls, theme, navigation, SEO, announcements, service groups, and versions live in collapsed sections in the scrolling main canvas. Opening a section automatically closes the previously open section.",
              "The right preview rail stays visible and does not scroll with the editor. The rendered page scrolls inside its own bounded preview frame while the preview toolbar remains fixed. Use the surface and viewport controls to review status, history, incident, access, hub, and embed layouts at desktop, tablet, or mobile sizes.",
            ],
          },
          {
            heading: "Draft versus live",
            paragraphs: [
              "Designer changes stay only in the browser until you choose Save, Save composition, or Save all. Every explicit save persists the design and updates the public page immediately.",
              "Saving an unchanged design does not increment its draft revision or create another live version.",
            ],
          },
          {
            heading: "Blocks and composition",
            paragraphs: [
              "The Add block library marks singleton blocks as Added and keeps reusable Rich text and Link cards available. New blocks enter the Primary zone and are selected for configuration.",
              "Drag blocks within Full width, Primary, or Sidebar to reorder them, or drag across zones. You can also select a block and change its Zone from the inspector. Save the composition when the preview is correct.",
            ],
          },
          {
            heading: "Templates and theme presets",
            paragraphs: [
              "Choose a page template from the dropdown and inspect the full preview before using it. Layout templates preserve the current theme and SEO settings.",
              "Theme presets are independent of layout. Preview Default or one of the curated color systems before applying it, then use the manual theme controls for typography, density, width, radius, shadow, and individual status colors.",
            ],
          },
          {
            heading: "Versions and reset",
            paragraphs: [
              "Each page retains its 30 newest saved design versions. When the next version is saved, the oldest version for that page is removed automatically. Restore loads a version into a reviewable local draft rather than immediately replacing the live page.",
              "Reset to default first shows a warning. Confirmation loads the default layout, blocks, theme, header/footer, SEO, and uptime presentation locally; it does not delete services, groups, incidents, subscribers, status history, or uploaded assets. Nothing public changes until you save.",
            ],
          },
        ],
      },
      {
        slug: "page-branding",
        title: "Branding & layout",
        summary: "Logo, brand color, layout (standard vs cover image), and custom CSS for one page.",
        body: [
          {
            heading: "Layout picker",
            paragraphs: [
              "Standard layout shows a small logo at the top. Cover image gives the page a large hero band using your brand color or an uploaded cover image URL — pick whichever fits your brand.",
            ],
          },
          {
            heading: "Custom CSS",
            paragraphs: ["Custom CSS is size-limited, scoped beneath the public page root, and rejects imports and external URLs to protect viewers."],
          },
        ],
      },
      {
        slug: "public-page-content",
        title: "Public page content",
        summary: "Configure summaries, service directories, announcements, uptime presentation, footer links, and visitor-facing behavior.",
        body: [
          {
            heading: "Service presentation",
            paragraphs: [
              "Keep the default flat rows for a simple page, or enable grouping when customers recognize product families, regions, or platforms. Optional summary cards and search are most useful on large directories.",
              "Uptime defaults to the responsive thin-segment timeline. The designer also offers square, rounded, pill, and solid lines; responsive, compact, and block sizes; and optional dot or status icons.",
            ],
          },
          {
            heading: "Announcements and subscription",
            paragraphs: [
              "Announcements can be scheduled, prioritized, made dismissible, and shown across status, history, incident, and hub surfaces. Use them for notices that are not full incidents.",
              "Subscription blocks can be placed in the main layout or sidebar. Actual delivery depends on the channels enabled under Destinations.",
            ],
          },
          {
            heading: "Footer links",
            paragraphs: [
              "Support, Terms of Service, and Privacy Policy belong in the footer. Support is shown only when a valid Support URL exists; absent links render nothing rather than empty placeholders.",
            ],
          },
        ],
      },
      {
        slug: "components",
        title: "Components & groups",
        summary: "The services that make up your product, grouped and ordered the way your customers understand them.",
        body: [
          {
            heading: "Adding components",
            paragraphs: [
              "Components are the functioning pieces of your product that can go down — API, Website, Mobile App. Group related ones (e.g. by region) with Component Groups, which collapse together on the public page.",
              "Use the drag handle to reorder components; numeric order fields are intentionally not used. In the designer, grouping is optional: the default remains a flat service list, while grouped pages can use sections, cards, or accordion dropdowns.",
            ],
          },
          {
            heading: "Changing status and adding notes",
            paragraphs: [
              "Select Operational, Degraded Performance, Partial Outage, Major Outage, or Under Maintenance. Add an optional public note before Update Status when customers need context.",
              "Status notes are retained with uptime history. Affected uptime segments show date, status, duration, and related notes on hover; days without recorded information do not display an empty tooltip.",
            ],
          },
          {
            heading: "Public directory options",
            paragraphs: [
              "The Component status block controls summary counters, search, descriptions, grouping, service rows or pills, column count, uptime window, line style, segment size, and icons. Preview changes before saving because every save updates the public page.",
            ],
          },
          {
            heading: "Automation token",
            paragraphs: [
              "Every component gets a unique automation webhook: POST /api/v1/webhook-component/<token> with {\"status\": \"...\"}. Any monitoring tool that can fire an HTTP request can flip status with zero human involvement.",
            ],
          },
        ],
      },
      {
        slug: "access-groups",
        title: "Audience access",
        summary: "For Audience-specific pages: per-user or per-group login with scoped component visibility.",
        body: [
          {
            heading: "How scoping works",
            paragraphs: [
              "Create Access Groups, each with a set of visible components. Then create Access Users with an email/password, optionally assigned to a group. A user sees the union of their own assigned components plus their group's.",
              "Audience-specific pages are useful when customers should each see a different, explicitly assigned slice of your systems.",
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "developers",
    label: "Developer guides",
    icon: "</>",
    articles: [
      {
        slug: "api-quickstart",
        title: "Management API quickstart",
        summary: "Authenticate with scoped API keys and automate incidents, component status, and metric points.",
        body: [
          {
            heading: "Create and protect a key",
            paragraphs: [
              "Create an API key under API Keys, grant only the scopes and pages the integration needs, and copy the token when it is displayed. Store it in a secret manager; the full value cannot be recovered later.",
              "Send the key as a Bearer token. A revoked or rotated key stops working immediately. Use /api/openapi as the machine-readable reference for available endpoints and schemas.",
            ],
            code: "curl -H 'Authorization: Bearer $SIGNALHUB_API_KEY' \\\n  'https://status.example.com/api/v1/manage/incidents?pageId=<page-id>'",
          },
          {
            heading: "Error handling",
            paragraphs: [
              "API errors return a stable code and message. Treat 401 as an invalid credential, 404 as a missing or out-of-scope resource, 400 as invalid input, 429 as rate limiting, and retry 5xx responses with bounded exponential backoff.",
            ],
          },
        ],
      },
      {
        slug: "component-automation",
        title: "Component status automation",
        summary: "Update component health with a scoped API key or a per-component automation token.",
        body: [
          {
            heading: "Per-component webhook",
            paragraphs: [
              "The automation token is embedded in the URL and acts as the credential. Use it for monitoring systems that can send a simple JSON POST but cannot manage Bearer headers. Rotate the token after exposure.",
            ],
            code: "curl -X POST 'https://status.example.com/api/v1/webhook-component/<token>' \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"status\":\"MAJOR_OUTAGE\"}'",
          },
          {
            heading: "Supported statuses",
            paragraphs: [],
            list: ["OPERATIONAL", "DEGRADED_PERFORMANCE", "PARTIAL_OUTAGE", "MAJOR_OUTAGE", "UNDER_MAINTENANCE"],
          },
          {
            heading: "Management API alternative",
            paragraphs: ["Use PATCH /api/v1/manage/components/<component-id> with a components.write API key when one integration manages multiple components."],
            code: "curl -X PATCH 'https://status.example.com/api/v1/manage/components/<component-id>' \\\n  -H 'Authorization: Bearer $SIGNALHUB_API_KEY' \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"status\":\"OPERATIONAL\"}'",
          },
        ],
      },
      {
        slug: "public-status-api",
        title: "Public status API and feeds",
        summary: "Consume page health as JSON, RSS, Atom, badges, or embeds with the page's access rules enforced.",
        body: [
          {
            heading: "JSON status",
            paragraphs: [
              "GET /api/v1/status/<slug> returns the public page summary, components, active incidents, and canonical URL. Public responses are CORS-enabled and briefly cached; protected pages enforce their configured access policy.",
            ],
            code: "curl 'https://status.example.com/api/v1/status/<slug>'",
          },
          {
            heading: "Feeds and embeds",
            paragraphs: [
              "RSS and Atom are suitable for feed readers and automation. Protected pages use revocable signed feed URLs. The badge endpoint provides a compact status asset, while the embed script can place an incident banner on another site.",
              "Do not expose protected feed tokens in public source code. Revoke and regenerate a token if it leaks.",
            ],
          },
        ],
      },
      {
        slug: "webhook-verification",
        title: "Outbound webhook verification",
        summary: "Verify HTTPS endpoints, validate HMAC signatures, handle retries safely, and rotate secrets.",
        body: [
          {
            heading: "Receiver requirements",
            paragraphs: [
              "Use an HTTPS endpoint that can accept JSON quickly. Verify the signature using the raw request bytes before parsing, reject invalid signatures, and return a 2xx response only after the event is accepted for processing.",
              "Make processing idempotent because retries can deliver the same logical event more than once. Queue slow downstream work instead of blocking the response.",
            ],
          },
          {
            heading: "Operational checklist",
            paragraphs: [],
            list: [
              "Store the endpoint secret outside source control.",
              "Log delivery identifiers without logging secrets or full subscriber data.",
              "Accept secret overlap during a planned rotation when your receiver supports it.",
              "Alert on sustained non-2xx delivery results rather than a single transient retry.",
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "platform",
    label: "Platform administration",
    icon: "◆",
    articles: [
      {
        slug: "platform-operations",
        title: "Platform operations",
        summary: "Monitor tenant state, worker readiness, queued work, and operational diagnostics across the installation.",
        body: [
          {
            heading: "Operational surfaces",
            paragraphs: [
              "Platform Overview summarizes installation health. Organizations and Global Users provide tenant and identity lookup, while Operations exposes worker and queue diagnostics needed for monitors, notifications, scheduled maintenance, and background jobs.",
              "Use the ready and live health endpoints for infrastructure probes. Treat a stale worker heartbeat as a service degradation even when the web application still responds.",
            ],
          },
          {
            heading: "Tenant lifecycle",
            paragraphs: [
              "Suspension fences tenant mutations and automation. Deletion is a reauthenticated, queued, retryable purge that retains request, job, tombstone, and audit evidence instead of performing an untracked inline delete.",
            ],
          },
        ],
      },
      {
        slug: "platform-identity",
        title: "Platform identity and access",
        summary: "Govern platform administrators, identity connections, organization switching, and support access.",
        body: [
          {
            heading: "Administrative separation",
            paragraphs: [
              "Platform roles and organization roles are separate. Grant platform access only to operators who need cross-tenant administration, and use organization-scoped roles for normal status operations.",
              "Identity configuration controls global SAML/OIDC connections and SCIM behavior. Test new connections before enforcing them and maintain a recoverable owner path.",
            ],
          },
          {
            heading: "Support sessions",
            paragraphs: [
              "Use support access only for an explicit customer support task. Actions remain attributed to the operator and support session in audit logs. End support access as soon as the task is complete.",
            ],
          },
        ],
      },
      {
        slug: "platform-configuration",
        title: "Platform configuration and governance",
        summary: "Configure providers, monitor templates, security defaults, and review platform-wide audit evidence.",
        body: [
          {
            heading: "Configuration",
            paragraphs: [
              "Enable only notification and identity providers that are actually configured. Provider readiness in the organization console reflects these platform settings and the required runtime services.",
              "Curated monitor templates should point to stable, documented targets. Exclude providers that cannot be checked truthfully rather than shipping a misleading template.",
            ],
          },
          {
            heading: "Audit and diagnostics",
            paragraphs: [
              "Use Platform Audit for cross-tenant administrative actions and exports. Diagnostics should help identify configuration or worker problems without exposing stored secrets.",
            ],
          },
        ],
      },
    ],
  },
];

export function findHelpArticle(categorySlug: string, articleSlug: string) {
  const category = HELP_CATEGORIES.find((c) => c.slug === categorySlug);
  const article = category?.articles.find((a) => a.slug === articleSlug);
  return { category, article };
}

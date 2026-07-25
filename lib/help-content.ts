export type HelpArticle = {
  slug: string;
  title: string;
  summary: string;
  body: HelpSection[];
};

export type HelpSection = { heading: string; paragraphs: string[]; list?: string[] };

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
              "Go to Pages → fill in a name, optional custom slug, and page type (Public, Private password-protected, or Audience-specific). Optionally mark it as a hub page, or attach it as a child of an existing hub.",
              "New pages route straight into the 5-step setup wizard: Add components → Add your logo → Notifications → Invite team → Incidents.",
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
              "Click Manage to edit branding (layout, logo, brand color, custom domain), components and component groups, and — for Audience pages — access groups and users.",
              "Click Build my page to re-enter the setup wizard at any time.",
            ],
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
              "Every meaningful admin action — creating or deleting a page, changing settings, inviting or removing a team member, starting a support session, or revoking an API key — writes one entry here with who did it and when.",
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
              "From a page's Components section, select an optional monitor template. Then use Monitors to customize its target, interval, assertions, thresholds, and automated actions.",
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
        title: "Team",
        summary: "Invite teammates and control what they can do with roles.",
        body: [
          {
            heading: "Roles",
            paragraphs: [],
            list: [
              "OWNER — ownership, identity policy, and every tenant administrative capability.",
              "ADMIN — team, pages, integrations, and organization configuration.",
              "RESPONDER — incidents, maintenance, monitors, metrics, and component status.",
            ],
          },
          {
            heading: "Inviting someone",
            paragraphs: [
              "Go to Team, enter the member's name, email, role, and page scope, then create the invitation link. Copy the single-use URL when it appears; it expires after 48 hours and is never stored in plaintext. New identities choose a password when accepting, while existing password-backed identities confirm their current password. Owners and Admins can invite members; only an Owner can grant ownership, and the last enabled active Owner can never be removed or demoted.",
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
        slug: "page-branding",
        title: "Branding & layout",
        summary: "Logo, brand color, layout (standard vs cover image), custom domain, and custom CSS for one page.",
        body: [
          {
            heading: "Layout picker",
            paragraphs: [
              "Standard layout shows a small logo at the top. Cover image gives the page a large hero band using your brand color or an uploaded cover image URL — pick whichever fits your brand.",
            ],
          },
          {
            heading: "Custom domain",
            paragraphs: [
              "Any page can use a domain like signal.yourcompany.com. Add a CNAME record at your DNS provider pointing to this app's domain, then enter the domain in page settings — the proxy serves its root, history, incidents, access flow, and feeds.",
            ],
          },
          {
            heading: "Custom CSS",
            paragraphs: ["Custom CSS is size-limited, scoped beneath the public page root, and rejects imports and external URLs to protect viewers."],
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
];

export function findHelpArticle(categorySlug: string, articleSlug: string) {
  const category = HELP_CATEGORIES.find((c) => c.slug === categorySlug);
  const article = category?.articles.find((a) => a.slug === articleSlug);
  return { category, article };
}

export function allHelpArticles() {
  return HELP_CATEGORIES.flatMap((c) => c.articles.map((a) => ({ category: c, article: a })));
}

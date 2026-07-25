import Link from "next/link";
import { Reveal } from "@/components/landing/Reveal";
import { Hero3D } from "@/components/landing/Hero3D";
import { ThemeToggle } from "@/components/ThemeToggle";

const PREVIEW_ITEMS = [
  ["REST API", "99.99%"],
  ["Dashboard", "99.97%"],
  ["Webhooks", "99.94%"],
  ["GraphQL API", "99.98%"],
  ["Auth", "100%"],
  ["Payments", "99.99%"],
  ["Mobile App", "99.95%"],
  ["Search", "99.96%"],
];

const FEATURES = [
  {
    n: "01",
    title: "Incident lifecycle",
    body: "Investigating → Identified → Monitoring → Resolved, with a timestamped public timeline, impact levels, and published postmortems.",
  },
  {
    n: "02",
    title: "Scheduled maintenance",
    body: "Plan windows ahead of time. Auto-start and auto-complete flip component status on schedule — no 3am human required.",
  },
  {
    n: "03",
    title: "Verified notifications",
    body: "SMTP email, signed webhooks, Slack, Teams, RSS, and Atom all flow through one durable outbox with retries and delivery history.",
  },
  {
    n: "04",
    title: "Uptime you can prove",
    body: "90-day uptime bars computed from a real status-event history, plus public system metrics charts your customers can inspect.",
  },
  {
    n: "05",
    title: "Custom domains",
    body: "Serve the page, history, incidents, access flow, embeds, and feeds at signal.yourcompany.com—with no plan or branding gate.",
  },
  {
    n: "06",
    title: "API-first automation",
    body: "Everything the console does, the management API does too. Per-component webhook tokens let monitors flip status with zero clicks.",
  },
];

const STEPS = [
  { n: "1", title: "Configure", body: "Copy the environment template, set strong instance secrets, SMTP, and optional OIDC." },
  { n: "2", title: "Deploy", body: "Start the web app, worker, migration job, and MongoDB replica set with Docker Compose." },
  { n: "3", title: "Bootstrap", body: "Create the first platform administrator and organization through the one-time secure CLI." },
];

const DEPLOYMENT_PILLARS = [
  {
    title: "Apache-2.0",
    body: "Use, inspect, modify, and redistribute SignalHub. There are no paid editions or feature-gated code paths.",
    detail: "Open source",
  },
  {
    title: "Docker Compose",
    body: "A production image, replica-set MongoDB, idempotent migrations, worker health, and graceful shutdown ship together.",
    detail: "First-class deployment",
  },
  {
    title: "Operator controlled",
    body: "Your domains, identities, encryption keys, delivery providers, monitoring policy, backups, and customer data stay yours.",
    detail: "Self-hosted",
  },
];

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-[var(--bg)] text-[var(--fg)]">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--bg)]/85 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-5">
          <Link href="/" className="flex items-center gap-2 font-mono text-lg font-bold tracking-tight text-[var(--fg)]">
            SignalHub
            <span className="relative -ml-1 mt-2 inline-block h-2 w-2 rounded-full bg-[var(--cyan)] pulse-dot" />
          </Link>
          <div className="ml-auto hidden items-center gap-7 text-sm text-[var(--fg-soft)] sm:flex">
            <a href="#features" className="hover:text-[var(--fg)]">Features</a>
            <a href="#how" className="hover:text-[var(--fg)]">Deploy</a>
            <a href="#community" className="hover:text-[var(--fg)]">Community</a>
            <a href="#preview" className="hover:text-[var(--fg)]">Product preview</a>
          </div>
          <div className="ml-auto flex items-center gap-3 sm:ml-0">
            <ThemeToggle />
            <Link href="/admin/login" className="text-sm font-medium text-[var(--fg-soft)] hover:text-[var(--fg)]">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="border border-[var(--cyan)] bg-[var(--cyan)] px-4 py-2 text-sm font-semibold text-[var(--on-cyan)] transition-transform hover:-translate-y-0.5"
            >
              Open console
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="grain relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-16 lg:grid-cols-2 lg:pt-24">
          <div>
            <Reveal>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--cyan)]">
                Open source · Self-hosted · Reliable
              </p>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="mt-5 font-mono text-5xl font-bold leading-[1.04] tracking-tight text-[var(--fg)] sm:text-6xl lg:text-7xl">
                Incident communication on <span className="text-[var(--cyan)]">your</span> infrastructure.
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-6 max-w-md text-lg leading-relaxed text-[var(--fg-soft)]">
                SignalHub is an Apache-2.0 service for public, private, and audience-scoped status pages, reliable monitoring,
                and durable subscriber delivery—without billing tiers or hosted-service lock-in.
              </p>
            </Reveal>
            <Reveal delay={240}>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  href="#how"
                  className="border border-[var(--cyan)] bg-[var(--cyan)] px-7 py-3.5 text-sm font-semibold text-[var(--on-cyan)] shadow-[0_12px_32px_-12px_rgba(34,211,238,0.4)] transition-transform hover:-translate-y-0.5"
                >
                  Deploy SignalHub
                </Link>
                <a href="#preview" className="group text-sm font-semibold text-[var(--fg)]">
                  See product preview{" "}
                  <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
                </a>
              </div>
            </Reveal>
            <Reveal delay={320}>
              <p className="mt-5 font-mono text-[11px] text-[var(--fg-dim)]">Apache-2.0 · Docker Compose · every feature included</p>
            </Reveal>
          </div>
          <div id="preview" className="relative scroll-mt-24">
            <Reveal delay={200}>
              <Hero3D />
            </Reveal>
          </div>
        </div>
      </section>

      {/* Uptime ticker */}
      <div
        className="relative border-y border-[var(--line)] bg-[var(--surface)] py-3.5"
        aria-label="Illustrative product status preview"
      >
        <p className="mb-2 text-center font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--fg-dim)]">
          Product preview · illustrative data
        </p>
        <div className="overflow-hidden">
          <div className="ticker-track items-center gap-10">
            {[0, 1].map((dup) => (
              <div key={dup} className="flex shrink-0 items-center gap-10 pr-10" aria-hidden={dup === 1}>
                {PREVIEW_ITEMS.map(([name, pct]) => (
                  <span key={`${dup}-${name}`} className="flex items-center gap-2.5 font-mono text-[11px] tracking-wide text-[var(--fg-soft)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--cyan)]" />
                    {name}
                    <span className="text-[var(--fg)]">{pct}</span>
                    <span className="text-[var(--fg-dim)]">uptime</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Features */}
      <section id="features" className="relative mx-auto max-w-6xl px-5 py-24">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--cyan)]">Everything included</p>
          <h2 className="mt-4 max-w-2xl font-mono text-4xl font-bold leading-tight tracking-tight text-[var(--fg)] sm:text-5xl">
            The whole incident, from <span className="text-[var(--cyan)]">&ldquo;investigating&rdquo;</span> to postmortem.
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.n} delay={i * 90}>
              <div className="group h-full border border-[var(--line)] bg-[var(--surface)] p-6 transition-all hover:-translate-y-1 hover:border-[var(--cyan)]">
                <span className="font-mono text-[11px] text-[var(--fg-dim)] transition-colors group-hover:text-[var(--cyan)]">{f.n}</span>
                <h3 className="mt-3 font-mono text-xl font-bold text-[var(--fg)]">{f.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-[var(--fg-soft)]">{f.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="relative border-y border-[var(--line)] bg-[var(--surface)] py-24">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--cyan)]">How it works</p>
            <h2 className="mt-4 font-mono text-4xl font-bold tracking-tight text-[var(--fg)] sm:text-5xl">Own the whole stack.</h2>
          </Reveal>
          <div className="mt-14 grid gap-10 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 120} className={i === 1 ? "sm:translate-y-8" : i === 2 ? "sm:translate-y-16" : ""}>
                <div>
                  <span
                    className="font-mono text-7xl font-bold text-transparent"
                    style={{ WebkitTextStroke: "1.5px var(--line-bright)" }}
                  >
                    {s.n}
                  </span>
                  <h3 className="mt-3 font-mono text-2xl font-bold text-[var(--fg)]">{s.title}</h3>
                  <p className="mt-2.5 max-w-xs text-sm leading-relaxed text-[var(--fg-soft)]">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Community */}
      <section id="community" className="relative mx-auto max-w-6xl px-5 py-24">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--cyan)]">Built in the open</p>
          <h2 className="mt-4 font-mono text-4xl font-bold tracking-tight text-[var(--fg)] sm:text-5xl">One edition. Every capability.</h2>
        </Reveal>
        <div className="mt-14 grid gap-5 sm:grid-cols-3">
          {DEPLOYMENT_PILLARS.map((pillar, i) => (
            <Reveal key={pillar.title} delay={i * 100}>
              <div className="flex h-full flex-col border border-[var(--line)] bg-[var(--surface)] p-7 transition-all hover:-translate-y-1 hover:border-[var(--cyan)]">
                <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--cyan)]">{pillar.detail}</p>
                <h3 className="mt-3 font-mono text-2xl font-bold text-[var(--fg)]">{pillar.title}</h3>
                <p className="mt-4 flex-1 text-sm leading-relaxed text-[var(--fg-soft)]">{pillar.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative mx-auto max-w-6xl px-5 pb-24">
        <Reveal>
          <div className="grain relative overflow-hidden border border-[var(--line)] bg-[var(--surface)] px-8 py-16 text-center sm:px-16">
            <h2 className="relative font-mono text-4xl font-bold tracking-tight text-[var(--fg)] sm:text-5xl">
              Run incident communication
              <br />
              <span className="text-[var(--cyan)]">on infrastructure you trust.</span>
            </h2>
            <div className="relative mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/admin/login"
                className="border border-[var(--cyan)] bg-[var(--cyan)] px-7 py-3.5 text-sm font-semibold text-[var(--on-cyan)] transition-transform hover:-translate-y-0.5"
              >
                Open the console
              </Link>
              <a href="#preview" className="text-sm font-semibold text-[var(--fg-soft)] hover:text-[var(--fg)]">
                review the product preview →
              </a>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-5 py-8 text-sm text-[var(--fg-dim)]">
          <span className="flex items-center gap-2 font-mono font-bold text-[var(--fg)]">
            SignalHub <span className="h-1.5 w-1.5 rounded-full bg-[var(--cyan)]" />
          </span>
          <a href="#features" className="hover:text-[var(--fg)]">Features</a>
          <a href="#how" className="hover:text-[var(--fg)]">Deploy</a>
          <Link href="/admin/login" className="hover:text-[var(--fg)]">Sign in</Link>
          <span>Apache-2.0</span>
          <span className="ml-auto font-mono text-[11px]">self-hosted · reliable · open</span>
        </div>
      </footer>
    </div>
  );
}

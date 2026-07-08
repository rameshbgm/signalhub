import Link from "next/link";
import { Reveal } from "@/components/landing/Reveal";
import { Hero3D } from "@/components/landing/Hero3D";
import { PLANS } from "@/lib/billing";

const TICKER_ITEMS = [
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
    title: "Subscribers, everywhere",
    body: "Email and SMS with OTP verification, webhooks, and Slack. Per-component subscriptions, quarantine, CSV import and export.",
  },
  {
    n: "04",
    title: "Uptime you can prove",
    body: "90-day uptime bars computed from a real status-event history, plus public system metrics charts your customers can inspect.",
  },
  {
    n: "05",
    title: "Custom domains",
    body: "status.yourcompany.com, not ours. Point a CNAME, claim the domain on your page, done. Branding removal on Pro.",
  },
  {
    n: "06",
    title: "API-first automation",
    body: "Everything the console does, the management API does too. Per-component webhook tokens let monitors flip status with zero clicks.",
  },
];

const STEPS = [
  { n: "1", title: "Create your page", body: "Sign up, name your organization, and get a branded public status page in under a minute." },
  { n: "2", title: "Add components", body: "Model your services — group them, order them, mirror third-party providers you depend on." },
  { n: "3", title: "Declare with confidence", body: "Open an incident, post updates, and every subscriber hears it from you first — not from Twitter." },
];

function limitLabel(n: number) {
  return Number.isFinite(n) ? String(n) : "Unlimited";
}

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-[var(--paper)] text-[var(--ink)]">
      {/* mesh background */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[820px]">
        <div className="absolute -left-40 -top-40 h-[560px] w-[560px] rounded-full bg-[var(--up-soft)] blur-3xl" />
        <div className="absolute -right-52 top-24 h-[480px] w-[480px] rounded-full bg-[#eef2f7] blur-3xl" />
      </div>
      <div className="grain absolute inset-0" aria-hidden />

      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-gray-200/70 bg-[var(--paper)]/80 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-5">
          <Link href="/" className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
            statuspage
            <span className="relative -ml-1 mt-2 inline-block h-2 w-2 rounded-full bg-[var(--up)] pulse-dot" />
          </Link>
          <div className="ml-auto hidden items-center gap-7 text-sm text-[var(--ink-soft)] sm:flex">
            <a href="#features" className="hover:text-[var(--ink)]">Features</a>
            <a href="#how" className="hover:text-[var(--ink)]">How it works</a>
            <a href="#pricing" className="hover:text-[var(--ink)]">Pricing</a>
            <Link href="/acme" className="hover:text-[var(--ink)]">Live demo</Link>
          </div>
          <div className="ml-auto flex items-center gap-3 sm:ml-0">
            <Link href="/admin/login" className="text-sm font-medium text-[var(--ink-soft)] hover:text-[var(--ink)]">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-[var(--ink)] px-4 py-2 text-sm font-medium text-white transition-transform hover:-translate-y-0.5"
            >
              Start free
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-16 lg:grid-cols-2 lg:pt-24">
        <div>
          <Reveal>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--up)]">
              Status pages · Incidents · Trust
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-5 font-display text-5xl font-medium leading-[1.04] tracking-tight sm:text-6xl">
              When something breaks, be the <em className="text-[var(--up)]">first</em> to say so.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-[var(--ink-soft)]">
              A branded status page, a calm incident timeline, and every subscriber notified in seconds. Downtime happens —
              silence is optional.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/signup"
                className="rounded-full bg-[var(--ink)] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_12px_32px_-12px_rgba(16,21,17,0.5)] transition-transform hover:-translate-y-0.5"
              >
                Create your status page
              </Link>
              <Link href="/acme" className="group text-sm font-semibold">
                View live demo{" "}
                <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
              </Link>
            </div>
          </Reveal>
          <Reveal delay={320}>
            <p className="mt-5 font-mono text-[11px] text-gray-400">Free plan · 1 status page · no card required</p>
          </Reveal>
        </div>
        <Reveal delay={200} className="relative">
          <Hero3D />
        </Reveal>
      </section>

      {/* Uptime ticker */}
      <div className="relative border-y border-gray-200/80 bg-white/60 py-3.5">
        <div className="overflow-hidden">
          <div className="ticker-track items-center gap-10">
            {[0, 1].map((dup) => (
              <div key={dup} className="flex shrink-0 items-center gap-10 pr-10" aria-hidden={dup === 1}>
                {TICKER_ITEMS.map(([name, pct]) => (
                  <span key={`${dup}-${name}`} className="flex items-center gap-2.5 font-mono text-[11px] tracking-wide text-gray-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--up)]" />
                    {name}
                    <span className="text-gray-900">{pct}</span>
                    <span className="text-gray-300">uptime</span>
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
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--up)]">Everything included</p>
          <h2 className="mt-4 max-w-2xl font-display text-4xl font-medium leading-tight tracking-tight sm:text-5xl">
            The whole incident, from <em className="text-[var(--up)]">“investigating”</em> to postmortem.
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.n} delay={i * 90}>
              <div className="group h-full rounded-2xl border border-gray-200 bg-white p-6 transition-all hover:-translate-y-1 hover:border-[var(--ink)] hover:shadow-[0_24px_48px_-24px_rgba(16,21,17,0.25)]">
                <span className="font-mono text-[11px] text-gray-300 transition-colors group-hover:text-[var(--up)]">{f.n}</span>
                <h3 className="mt-3 font-display text-xl font-semibold">{f.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-[var(--ink-soft)]">{f.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="relative border-y border-gray-200/80 bg-white/60 py-24">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--up)]">How it works</p>
            <h2 className="mt-4 font-display text-4xl font-medium tracking-tight sm:text-5xl">Live in three moves.</h2>
          </Reveal>
          <div className="mt-14 grid gap-10 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 120} className={i === 1 ? "sm:translate-y-8" : i === 2 ? "sm:translate-y-16" : ""}>
                <div>
                  <span
                    className="font-display text-7xl font-medium text-transparent"
                    style={{ WebkitTextStroke: "1.5px #c9d2cc" }}
                  >
                    {s.n}
                  </span>
                  <h3 className="mt-3 font-display text-2xl font-semibold">{s.title}</h3>
                  <p className="mt-2.5 max-w-xs text-sm leading-relaxed text-[var(--ink-soft)]">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative mx-auto max-w-6xl px-5 py-24">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--up)]">Pricing</p>
          <h2 className="mt-4 font-display text-4xl font-medium tracking-tight sm:text-5xl">Start free. Grow calm.</h2>
        </Reveal>
        <div className="mt-14 grid gap-5 sm:grid-cols-3">
          {Object.values(PLANS).map((p, i) => {
            const featured = p.id === "pro";
            return (
              <Reveal key={p.id} delay={i * 100}>
                <div
                  className={`flex h-full flex-col rounded-2xl border p-7 transition-all hover:-translate-y-1 ${
                    featured
                      ? "border-[var(--ink)] bg-[var(--ink)] text-white shadow-[0_32px_64px_-24px_rgba(16,21,17,0.5)]"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-display text-2xl font-semibold">{p.name}</h3>
                    {featured && (
                      <span className="rounded-full bg-[var(--up)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-white">
                        Popular
                      </span>
                    )}
                  </div>
                  <p className="mt-4 font-display text-5xl font-medium">
                    ${p.priceUsd}
                    <span className={`text-base ${featured ? "text-white/50" : "text-gray-400"}`}>/mo</span>
                  </p>
                  <ul className={`mt-6 flex-1 space-y-2.5 text-sm ${featured ? "text-white/80" : "text-[var(--ink-soft)]"}`}>
                    <li>{limitLabel(p.limits.pages)} status page{p.limits.pages === 1 ? "" : "s"}</li>
                    <li>{limitLabel(p.limits.teamMembers)} team members</li>
                    <li>{limitLabel(p.limits.subscribersPerPage)} subscribers per page</li>
                    <li>{p.customDomain ? "Custom domains" : "statuspage subdomain"}</li>
                    <li>{p.removeBranding ? "Remove branding" : "Platform branding"}</li>
                  </ul>
                  <Link
                    href="/signup"
                    className={`mt-7 rounded-full py-3 text-center text-sm font-semibold transition-transform hover:-translate-y-0.5 ${
                      featured ? "bg-white text-[var(--ink)]" : "bg-[var(--ink)] text-white"
                    }`}
                  >
                    {p.priceUsd === 0 ? "Start free" : `Start with ${p.name}`}
                  </Link>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="relative mx-auto max-w-6xl px-5 pb-24">
        <Reveal>
          <div className="grain relative overflow-hidden rounded-3xl bg-[var(--ink)] px-8 py-16 text-center text-white sm:px-16">
            <div aria-hidden className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[var(--up)]/20 blur-3xl" />
            <div aria-hidden className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-[var(--up)]/15 blur-3xl" />
            <h2 className="relative font-display text-4xl font-medium tracking-tight sm:text-5xl">
              Your next incident is coming.
              <br />
              <em className="text-[#7fd7ab]">Meet it ready.</em>
            </h2>
            <div className="relative mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/signup"
                className="rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-[var(--ink)] transition-transform hover:-translate-y-0.5"
              >
                Create your status page
              </Link>
              <Link href="/acme" className="text-sm font-semibold text-white/80 hover:text-white">
                or explore the live demo →
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-gray-200/80 bg-white/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-5 py-8 text-sm text-gray-400">
          <span className="flex items-center gap-2 font-display font-semibold text-[var(--ink)]">
            statuspage <span className="h-1.5 w-1.5 rounded-full bg-[var(--up)]" />
          </span>
          <Link href="/acme" className="hover:text-[var(--ink)]">Demo hub</Link>
          <Link href="/api-platform" className="hover:text-[var(--ink)]">Demo page</Link>
          <Link href="/admin/login" className="hover:text-[var(--ink)]">Sign in</Link>
          <Link href="/signup" className="hover:text-[var(--ink)]">Start free</Link>
          <span className="ml-auto font-mono text-[11px]">status · incidents · trust</span>
        </div>
      </footer>
    </div>
  );
}

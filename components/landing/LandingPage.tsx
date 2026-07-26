"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  BellRing,
  BadgeDollarSign,
  Blocks,
  Box,
  Check,
  CircleUserRound,
  CodeXml,
  Container,
  ExternalLink,
  FileCheck2,
  GitFork,
  KeyRound,
  LockKeyhole,
  RadioTower,
  ServerCog,
  ShieldCheck,
  Siren,
} from "lucide-react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import OperationsPreview from "./OperationsPreview";
import styles from "./landing.module.css";

const REPOSITORY_URL = "https://github.com/rameshbgm/signalhub";
const DEPLOYMENT_GUIDE_URL =
  "https://github.com/rameshbgm/signalhub/blob/main/docs/OPEN_SOURCE_SETUP_GUIDE.md";
const SECURITY_URL =
  "https://github.com/rameshbgm/signalhub/blob/main/SECURITY.md";
const HELM_GUIDE_URL =
  "https://github.com/rameshbgm/signalhub/tree/main/deploy/helm/status";

const CAPABILITIES = [
  {
    icon: RadioTower,
    title: "Status pages",
    body: "Public, private, and audience-scoped pages with component groups, history, metrics, and postmortems.",
    className: styles.capabilityWide,
    accent: "blue",
    tag: "Every audience",
  },
  {
    icon: Activity,
    title: "Monitoring",
    body: "HTTP, TCP, DNS, SSL, keyword, ICMP, and heartbeat checks with threshold-based recovery.",
    className: styles.capabilityTall,
    accent: "mint",
    tag: "Seven monitor types",
  },
  {
    icon: Siren,
    title: "Incident lifecycle",
    body: "Move from investigating to resolved with a durable, timestamped public record.",
    className: "",
    accent: "violet",
    tag: "One clear timeline",
  },
  {
    icon: BellRing,
    title: "Subscriber delivery",
    body: "Verified email, SMS, Slack, Teams, RSS, Atom, and signed webhooks with retries.",
    className: styles.capabilityWide,
    accent: "mint",
    tag: "Durable outbox",
  },
  {
    icon: KeyRound,
    title: "Enterprise identity",
    body: "OIDC, SAML, SCIM 2.0, MFA, fixed RBAC, page scopes, and a local break-glass Admin.",
    className: "",
    accent: "violet",
    tag: "Identity stays yours",
  },
  {
    icon: CodeXml,
    title: "APIs by default",
    body: "OpenAPI, management APIs, scoped keys, component webhooks, and Prometheus telemetry.",
    className: styles.capabilityWide,
    accent: "blue",
    tag: "Automation ready",
  },
  {
    icon: FileCheck2,
    title: "Audit evidence",
    body: "SHA-256 chained tenant and platform trails, exportable for review or SIEM delivery.",
    className: "",
    accent: "mint",
    tag: "Verifiable history",
  },
] as const;

const OWNERSHIP_STEPS = [
  {
    number: "01",
    icon: RadioTower,
    kicker: "Own the signal",
    title: "Your incident channel should not depend on another application control plane.",
    body: "SignalHub runs beside the systems it describes, with monitoring policy, status history, and communication workflows under operator control.",
  },
  {
    number: "02",
    icon: LockKeyhole,
    kicker: "Own the data",
    title: "Keep operational records and subscriber data inside your security boundary.",
    body: "Your MongoDB, object storage, identity connections, encryption keys, domains, backups, and retention policies remain yours.",
  },
  {
    number: "03",
    icon: ShieldCheck,
    kicker: "Own the response",
    title: "Automate the response without waiting on a vendor tier or roadmap.",
    body: "Every capability ships in the same Apache-2.0 codebase, ready to inspect, change, integrate, and operate on your terms.",
  },
] as const;

const DEPLOYMENTS = [
  {
    icon: Container,
    eyebrow: "Straightforward start",
    title: "Docker Compose",
    body: "Run the web app, worker, migrations, and replica-set MongoDB from the production stack included in the repository.",
    detail: "Ideal for a controlled host or evaluation environment.",
  },
  {
    icon: Blocks,
    eyebrow: "Cluster native",
    title: "Kubernetes + Helm",
    body: "Use the maintained chart for separate web and worker deployments, probes, migration jobs, ingress, and secrets.",
    detail: "Designed for an existing Kubernetes operating model.",
  },
  {
    icon: ServerCog,
    eyebrow: "Your control plane",
    title: "Operator controlled",
    body: "Choose the network, regions, delivery providers, observability stack, backup policy, and recovery process.",
    detail: "Private cloud, sovereign cloud, or isolated network.",
  },
] as const;

function ExternalAnchor({
  href,
  className,
  children,
  ariaLabel,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <a
      href={href}
      className={className}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
    >
      {children}
    </a>
  );
}

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 24 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{
        duration: reduceMotion ? 0 : 0.65,
        delay: reduceMotion ? 0 : delay,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}

export function LandingPage({ fontClassName }: { fontClassName: string }) {
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 110,
    damping: 24,
    mass: 0.25,
  });
  const previewY = useTransform(scrollYProgress, [0, 0.22], [0, 56]);
  const accentY = useTransform(scrollYProgress, [0, 0.35], [0, -72]);

  return (
    <div className={`${styles.page} ${fontClassName}`}>
      <motion.div
        className={styles.scrollProgress}
        style={{ scaleX: reduceMotion ? 0 : smoothProgress }}
        aria-hidden="true"
      />

      <header className={styles.header}>
        <nav className={styles.nav} aria-label="Primary navigation">
          <Link href="/" className={styles.brand} aria-label="SignalHub home">
            <span className={styles.brandMark} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span>SignalHub</span>
          </Link>

          <div className={styles.navLinks}>
            <a href="#why">Why SignalHub</a>
            <a href="#capabilities">Capabilities</a>
            <a href="#deploy">Deploy</a>
          </div>

          <div className={styles.navActions}>
            <Link href="/login" className={styles.signIn}>
              Log in
            </Link>
            <ExternalAnchor
              href={REPOSITORY_URL}
              className={styles.githubButton}
              ariaLabel="SignalHub on GitHub (opens in a new tab)"
            >
              <GitFork size={17} aria-hidden="true" />
              <span>View on GitHub</span>
            </ExternalAnchor>
          </div>
        </nav>
      </header>

      <main>
        <section className={styles.hero} aria-labelledby="hero-title">
          <motion.div
            className={styles.heroGlow}
            style={{ y: reduceMotion ? 0 : accentY }}
            aria-hidden="true"
          />
          <div className={styles.heroInner}>
            <motion.div
              className={styles.heroCopy}
              initial={reduceMotion ? false : "hidden"}
              animate="visible"
              variants={{
                hidden: {},
                visible: {
                  transition: {
                    staggerChildren: reduceMotion ? 0 : 0.1,
                    delayChildren: reduceMotion ? 0 : 0.08,
                  },
                },
              }}
            >
              <motion.p
                className={styles.eyebrow}
                variants={{
                  hidden: { opacity: 0, y: 14 },
                  visible: { opacity: 1, y: 0 },
                }}
                transition={{ duration: reduceMotion ? 0 : 0.55 }}
              >
                <span className={styles.liveDot} aria-hidden="true" />
                Apache-2.0 · Self-hosted status infrastructure
              </motion.p>
              <motion.h1
                id="hero-title"
                variants={{
                  hidden: { opacity: 0, y: 22 },
                  visible: { opacity: 1, y: 0 },
                }}
                transition={{
                  duration: reduceMotion ? 0 : 0.7,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                Stop renting your status page.
              </motion.h1>
              <motion.p
                className={styles.heroLead}
                variants={{
                  hidden: { opacity: 0, y: 18 },
                  visible: { opacity: 1, y: 0 },
                }}
                transition={{ duration: reduceMotion ? 0 : 0.6 }}
              >
                SignalHub replaces recurring application-license subscriptions
                with open-source status pages, monitoring, incident response,
                and subscriber delivery—while your data and operations stay
                under your control.
              </motion.p>
              <motion.div
                className={styles.heroActions}
                variants={{
                  hidden: { opacity: 0, y: 16 },
                  visible: { opacity: 1, y: 0 },
                }}
              >
                <ExternalAnchor
                  href={REPOSITORY_URL}
                  className={styles.primaryButton}
                >
                  <GitFork size={19} aria-hidden="true" />
                  Get SignalHub on GitHub
                  <ArrowRight size={18} aria-hidden="true" />
                </ExternalAnchor>
                <ExternalAnchor
                  href={DEPLOYMENT_GUIDE_URL}
                  className={styles.secondaryButton}
                >
                  Read the deployment guide
                  <ExternalLink size={16} aria-hidden="true" />
                </ExternalAnchor>
              </motion.div>
              <motion.div
                className={styles.costNotes}
                variants={{
                  hidden: { opacity: 0 },
                  visible: { opacity: 1 },
                }}
              >
                <p className={styles.costNote}>
                  <BadgeDollarSign size={15} aria-hidden="true" />
                  Zero license cost. No per-seat or per-page fees. Your
                  platform, your control.
                </p>
                <p className={styles.costNote}>
                  <ServerCog size={15} aria-hidden="true" />
                  Deploy anywhere. Keep your data and operations under your
                  control.
                </p>
                <p className={styles.costNote}>
                  <Blocks size={15} aria-hidden="true" />
                  Customize every status page and workflow without
                  feature-gated plans.
                </p>
              </motion.div>
            </motion.div>

            <motion.div
              className={styles.heroVisual}
              style={{ y: reduceMotion ? 0 : previewY }}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                duration: reduceMotion ? 0 : 1,
                delay: reduceMotion ? 0 : 0.18,
                ease: [0.22, 1, 0.36, 1],
              }}
              aria-hidden="true"
            >
              <OperationsPreview />
            </motion.div>
          </div>

          <div className={styles.heroProof} aria-label="SignalHub principles">
            <span>
              <Check size={15} aria-hidden="true" /> Every capability included
            </span>
            <span>
              <Check size={15} aria-hidden="true" /> No license server
            </span>
            <span>
              <Check size={15} aria-hidden="true" /> No hosted control plane
            </span>
          </div>
        </section>

        <section
          id="why"
          className={styles.comparison}
          aria-labelledby="comparison-title"
        >
          <div className={styles.sectionIntro}>
            <Reveal>
              <p className={styles.sectionKicker}>A different cost model</p>
              <h2 id="comparison-title">
                Pay for infrastructure, not permission.
              </h2>
              <p>
                Hosted software bundles convenience with a recurring
                application license. SignalHub gives your team the complete
                platform without license-driven feature gates.
              </p>
            </Reveal>
          </div>

          <div className={styles.comparisonGrid}>
            <Reveal className={styles.hostedCard}>
              <div className={styles.comparisonCardHeader}>
                <Box size={22} aria-hidden="true" />
                <div>
                  <p>Recurring hosted software</p>
                  <h3>Rent the application</h3>
                </div>
              </div>
              <ul>
                <li>Application fee renews every month or year</li>
                <li>Capabilities can depend on the selected tier</li>
                <li>Pricing can scale with pages, users, or subscribers</li>
                <li>Operational data lives in a vendor-managed plane</li>
              </ul>
              <div className={styles.costLine}>
                <span>Recurring license</span>
                <span className={styles.costBars} aria-label="Repeats over time">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            </Reveal>

            <Reveal className={styles.signalHubCard} delay={0.08}>
              <div className={styles.comparisonBadge}>SignalHub</div>
              <div className={styles.comparisonCardHeader}>
                <RadioTower size={22} aria-hidden="true" />
                <div>
                  <p>Apache-2.0 software</p>
                  <h3>Own the application</h3>
                </div>
              </div>
              <ul>
                <li>Zero application license fee</li>
                <li>Every capability ships in one edition</li>
                <li>Scale pages and teams without license metering</li>
                <li>Data, keys, domains, and operations stay in your control</li>
              </ul>
              <div className={styles.includedLine}>
                <span className={styles.liveDot} aria-hidden="true" />
                Infrastructure + operations remain your responsibility
              </div>
            </Reveal>
          </div>
        </section>

        <section
          id="capabilities"
          className={styles.capabilities}
          aria-labelledby="capabilities-title"
        >
          <div className={styles.sectionIntroRow}>
            <Reveal>
              <p className={styles.sectionKicker}>One complete edition</p>
              <h2 id="capabilities-title">
                Everything between a failed check and a trusted update.
              </h2>
            </Reveal>
            <Reveal className={styles.sectionAside} delay={0.08}>
              No premium tier. No page limits in the code. No features held
              behind a license key.
            </Reveal>
          </div>

          <motion.div
            className={styles.bentoGrid}
            initial={reduceMotion ? false : "hidden"}
            whileInView="visible"
            viewport={{ once: true, amount: 0.08 }}
            variants={{
              hidden: {},
              visible: {
                transition: {
                  staggerChildren: reduceMotion ? 0 : 0.07,
                },
              },
            }}
          >
            {CAPABILITIES.map((item) => {
              const Icon = item.icon;
              return (
                <motion.article
                  key={item.title}
                  className={`${styles.capabilityCard} ${item.className}`}
                  data-accent={item.accent}
                  variants={{
                    hidden: { opacity: 0, y: 24 },
                    visible: { opacity: 1, y: 0 },
                  }}
                  transition={{
                    duration: reduceMotion ? 0 : 0.55,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  whileHover={
                    reduceMotion ? undefined : { y: -5, scale: 1.005 }
                  }
                >
                  <div className={styles.capabilityTop}>
                    <span className={styles.iconBox}>
                      <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
                    </span>
                    <span className={styles.capabilityTag}>{item.tag}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                  <span className={styles.cardSignal} aria-hidden="true" />
                </motion.article>
              );
            })}
          </motion.div>
        </section>

        <OwnershipStory reducedMotion={Boolean(reduceMotion)} />

        <section
          id="deploy"
          className={styles.deploy}
          aria-labelledby="deploy-title"
        >
          <div className={styles.deployHeading}>
            <Reveal>
              <p className={styles.sectionKicker}>Choose your environment</p>
              <h2 id="deploy-title">Deployment that fits your operating model.</h2>
              <p>
                Start on one host, run in your Kubernetes platform, or shape
                SignalHub around stricter infrastructure boundaries.
              </p>
            </Reveal>
            <Reveal delay={0.08}>
              <ExternalAnchor
                href={DEPLOYMENT_GUIDE_URL}
                className={styles.textLink}
              >
                Open the full deployment guide
                <ArrowRight size={17} aria-hidden="true" />
              </ExternalAnchor>
            </Reveal>
          </div>

          <div className={styles.deployGrid}>
            {DEPLOYMENTS.map((item, index) => {
              const Icon = item.icon;
              return (
                <Reveal
                  className={styles.deployCard}
                  delay={index * 0.08}
                  key={item.title}
                >
                  <div className={styles.deployIcon}>
                    <Icon size={23} strokeWidth={1.8} aria-hidden="true" />
                  </div>
                  <p className={styles.deployEyebrow}>{item.eyebrow}</p>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                  <span>{item.detail}</span>
                </Reveal>
              );
            })}
          </div>
        </section>

        <section className={styles.finalCta} aria-labelledby="cta-title">
          <Reveal className={styles.finalCtaInner}>
            <div className={styles.ctaMark} aria-hidden="true">
              <GitFork size={28} />
            </div>
            <p className={styles.sectionKicker}>Available now on GitHub</p>
            <h2 id="cta-title">Make the status page yours.</h2>
            <p>
              Inspect the code, deploy the complete platform, and keep your
              incident communication where your team can control it.
            </p>
            <div className={styles.ctaActions}>
              <ExternalAnchor
                href={REPOSITORY_URL}
                className={styles.primaryButton}
              >
                <GitFork size={19} aria-hidden="true" />
                Explore the repository
                <ArrowRight size={18} aria-hidden="true" />
              </ExternalAnchor>
              <Link href="/login" className={styles.secondaryButton}>
                <CircleUserRound size={17} aria-hidden="true" />
                Log in
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerMain}>
          <div className={styles.footerBrand}>
            <Link href="/" className={styles.brand}>
              <span className={styles.brandMark} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span>SignalHub</span>
            </Link>
            <p>
              Self-hosted status infrastructure for teams that want to own the
              signal.
            </p>
          </div>
          <div className={styles.footerLinks}>
            <div>
              <p>Product</p>
              <a href="#why">Why SignalHub</a>
              <a href="#capabilities">Capabilities</a>
              <a href="#deploy">Deploy</a>
              <Link href="/login">Log in</Link>
            </div>
            <div>
              <p>Project</p>
              <ExternalAnchor href={REPOSITORY_URL}>GitHub</ExternalAnchor>
              <ExternalAnchor href={DEPLOYMENT_GUIDE_URL}>
                Setup guide
              </ExternalAnchor>
              <ExternalAnchor href={HELM_GUIDE_URL}>Helm chart</ExternalAnchor>
              <ExternalAnchor href={SECURITY_URL}>
                Security policy
              </ExternalAnchor>
            </div>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <span>Apache-2.0 licensed. Infrastructure costs still apply.</span>
          <span>
            Created and maintained by{" "}
            <ExternalAnchor href="https://github.com/rameshbgm">
              Ramesh BGM
            </ExternalAnchor>
            .
          </span>
        </div>
      </footer>
    </div>
  );
}

function OwnershipStory({ reducedMotion }: { reducedMotion: boolean }) {
  const { scrollYProgress } = useScroll();
  const beamScale = useTransform(scrollYProgress, [0.38, 0.7], [0, 1]);

  return (
    <section className={styles.ownership} aria-labelledby="ownership-title">
      <div className={styles.ownershipInner}>
        <div className={styles.ownershipSticky}>
          <p className={styles.sectionKicker}>The ownership advantage</p>
          <h2 id="ownership-title">
            Own the signal.
            <br />
            Own the data.
            <br />
            Own the response.
          </h2>
          <p>
            Status infrastructure is most valuable when it stays dependable
            during the exact moments the rest of your stack is under pressure.
          </p>
          <div className={styles.ownershipRail} aria-hidden="true">
            <motion.span
              style={{ scaleY: reducedMotion ? 1 : beamScale }}
            />
          </div>
        </div>
        <div className={styles.ownershipSteps}>
          {OWNERSHIP_STEPS.map((item, index) => {
            const Icon = item.icon;
            return (
              <Reveal
                className={styles.ownershipStep}
                delay={index * 0.06}
                key={item.kicker}
              >
                <div className={styles.stepNumber}>{item.number}</div>
                <span className={styles.ownershipIcon}>
                  <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <p className={styles.stepKicker}>{item.kicker}</p>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

import Link from "next/link";
import { Activity, ArrowRight, LockKeyhole, ShieldCheck, UsersRound } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { HostingAttribution } from "@/components/HostingAttribution";
import styles from "./workspace.module.css";

function WorkspaceIllustration() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 480 280" fill="none" className={styles.illustration}>
      <rect x="65" y="21" width="338" height="204" rx="20" fill="currentColor" opacity="0.04" />
      <rect x="83" y="37" width="338" height="204" rx="20" fill="currentColor" opacity="0.06" />
      <rect x="43" y="53" width="350" height="204" rx="18" fill="white" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.5" />
      <path d="M44 92H392" stroke="currentColor" strokeOpacity="0.12" />
      <rect x="59" y="66" width="19" height="14" rx="4" fill="currentColor" opacity="0.15" />
      <path d="M90 73H149" stroke="currentColor" strokeOpacity="0.24" strokeWidth="5" strokeLinecap="round" />
      <circle cx="350" cy="73" r="3" fill="currentColor" opacity="0.2" />
      <circle cx="363" cy="73" r="3" fill="currentColor" opacity="0.2" />
      <circle cx="376" cy="73" r="3" fill="currentColor" opacity="0.2" />
      <path d="M105 93V256" stroke="currentColor" strokeOpacity="0.1" />
      <rect x="58" y="110" width="32" height="28" rx="7" fill="currentColor" opacity="0.12" />
      <rect x="66" y="120" width="16" height="7" rx="2" fill="currentColor" opacity="0.5" />
      <path d="M65 157H83M65 182H83M65 207H83" stroke="currentColor" strokeOpacity="0.18" strokeWidth="5" strokeLinecap="round" />
      <circle cx="247" cy="154" r="38" fill="currentColor" opacity="0.07" />
      <UsersRound x="225" y="132" size={44} stroke="currentColor" strokeWidth={1.5} />
      <path d="M206 213H288M225 229H269" stroke="currentColor" strokeOpacity="0.17" strokeWidth="5" strokeLinecap="round" />
      <path d="M138 142H172M138 158H159M320 139H353M334 155H353" stroke="currentColor" strokeOpacity="0.13" strokeWidth="4" strokeLinecap="round" />
      <circle cx="389" cy="219" r="37" fill="white" />
      <circle cx="389" cy="219" r="33" fill="currentColor" opacity="0.09" />
      <ShieldCheck x="371" y="201" size={36} stroke="currentColor" strokeWidth={1.6} />
      <circle cx="69" cy="39" r="5" fill="currentColor" opacity="0.24" />
      <path d="M435 105V119M428 112H442" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function WorkspaceWelcome({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  return (
    <div className={`${styles.page} bg-canvas text-ink selection:bg-primary-soft selection:text-primary-ink`}>
      <header className={styles.header}>
        <Link href="/" aria-label={`${name} home`} className="inline-flex min-w-0 items-center gap-2.5 rounded-control font-bold tracking-tight outline-none focus-visible:ring-4 focus-visible:ring-primary/25">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- installation branding accepts operator-hosted images
            <img src={logoUrl} width={34} height={34} alt="" className="size-[34px] shrink-0 object-contain" />
          ) : <span className="flex size-[34px] shrink-0 items-center justify-center rounded-card bg-primary text-white"><Activity aria-hidden="true" size={20} /></span>}
          <span className="min-w-0 break-words">{name}</span>
        </Link>
      </header>
      <main className={styles.main}>
        <div className={styles.welcome}>
          <WorkspaceIllustration />
          <h1 className={styles.title}>Welcome to your<br /><span className="text-primary-ink">workspace.</span></h1>
          <p className={styles.description}>Sign in to continue with your organization account.</p>
          <Link href="/login" className={buttonVariants({ size: "lg", className: `${styles.signIn} group` })}>
            <LockKeyhole aria-hidden="true" size={17} strokeWidth={1.8} />
            Sign in to workspace
            <ArrowRight aria-hidden="true" size={17} className="ml-auto transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" />
          </Link>
        </div>
      </main>
      <footer className={styles.footer}>
        <a href="https://signalhub.at" target="_blank" rel="noopener noreferrer" className="rounded-control text-xs text-ink-dim underline-offset-4 outline-none hover:text-primary-ink hover:underline focus-visible:ring-4 focus-visible:ring-primary/25">Powered by SignalHub</a>
        <HostingAttribution className="mx-auto mt-2 block w-fit rounded-control text-xs text-ink-dim underline-offset-4 outline-none hover:text-primary-ink hover:underline focus-visible:ring-4 focus-visible:ring-primary/25" />
      </footer>
    </div>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import {
  Ban, Building2, CheckCheck, CirclePause, ClipboardCheck, Cpu, Database, Globe, HardDrive, Hourglass, Inbox, ListChecks,
  Mail, Send, Smartphone, UsersRound, Activity, type LucideIcon,
} from "lucide-react";
import { IconTile } from "@/components/ui/icon-tile";
import type { StatusCard, StatusIcon, StatusTone } from "@/lib/platform-status";
import { cn } from "@/lib/utils";

const ICONS: Record<StatusIcon, LucideIcon> = {
  organizations: Building2, suspended: CirclePause, identities: UsersRound, database: Database, migrations: ClipboardCheck, worker: Cpu,
  jobs: ListChecks, queued: Send, processing: Hourglass, blocked: Ban, delivered: CheckCheck, deadLetter: Inbox,
  email: Mail, sms: Smartphone, url: Globe, storage: HardDrive, telemetry: Activity,
};

const TONE_LABEL: Record<Exclude<StatusTone, "normal">, string> = { warn: "Needs review", danger: "Action needed" };
const box = "flex h-full min-w-0 flex-col justify-between gap-1 rounded-card border border-line bg-surface p-4 shadow-card";
const linkBox = "outline-none transition-[border-color,box-shadow] duration-150 hover:border-line-strong hover:shadow-raised focus-visible:ring-[3px] focus-visible:ring-primary/30";

const SHORT_DETAIL = 16;

/** One status: what it is, its value, and a plain-words description. The tone never rests on colour alone. */
export function PlatformStat({ card }: { card: StatusCard }) {
  const { label, value, detail, description, tone, href } = card;
  const longDetail = Boolean(detail && detail.length > SHORT_DETAIL);
  const content: ReactNode = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-[0.8125rem] font-semibold leading-5 text-ink">
          <span className="truncate">{label}</span>
          {tone !== "normal" && <><span aria-hidden className={cn("size-2 shrink-0 rounded-full", tone === "danger" ? "bg-danger" : "bg-warn")} /><span className="sr-only">{TONE_LABEL[tone]}</span></>}
        </p>
        <IconTile icon={ICONS[card.icon]} hue={tone === "warn" ? "amber" : tone === "danger" ? "rose" : "violet"} size="sm" />
      </div>
      <div className="flex min-w-0 items-baseline gap-2">
        <p className={cn("shrink-0 whitespace-nowrap font-bold tabular-nums tracking-tight", tone === "danger" ? "text-danger-fg" : "text-ink", typeof value === "number" ? "text-2xl" : "text-lg")}>{value}</p>
        {detail && !longDetail && <p className="min-w-0 truncate text-xs text-ink-dim">{detail}</p>}
      </div>
      <div className="min-w-0">
        {longDetail && <p className={cn("truncate text-xs font-medium", tone === "danger" ? "text-danger-fg" : "text-warn-fg")} title={detail}>{detail}</p>}
        <p className={cn("text-xs leading-4 text-ink-soft", longDetail ? "line-clamp-1" : "line-clamp-2")} title={description}>{description}</p>
      </div>
    </>
  );
  return href ? <Link href={href} className={cn(box, linkBox)}>{content}</Link> : <div className={box}>{content}</div>;
}

/**
 * All status cards, four columns by three rows on a wide screen. Anything beyond scrolls inside the
 * wall, and the thin scrollbar stays visible (macOS hides overlay scrollbars otherwise).
 */
export function StatusWall({ cards }: { cards: StatusCard[] }) {
  return (
    <section aria-label="Platform status">
      <div
        tabIndex={0}
        role="group"
        aria-label={`Platform status, ${cards.length} items. Scroll for more.`}
        className="scroll-thin grid max-h-[calc(3*8.25rem+2*1rem)] auto-rows-[8.25rem] grid-cols-1 gap-4 pr-3 outline-none focus-visible:ring-[3px] focus-visible:ring-primary/30 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 [&::-webkit-scrollbar]:w-2"
      >
        {cards.map((card) => <PlatformStat key={card.id} card={card} />)}
      </div>
    </section>
  );
}

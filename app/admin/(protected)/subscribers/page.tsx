import Link from "next/link";
import { BadgeCheck, Clock, Download, Mail, Plus, ShieldAlert, ShieldCheck, ShieldOff, Trash2, Upload, UsersRound, type LucideIcon } from "lucide-react";
import { requireSession } from "@/lib/require-session";
import { Select } from "@/components/ui/select";
import { database } from "@/lib/postgres/client";
import { addSubscriber, importSubscribersCsv, toggleQuarantine, removeSubscriber, retryNotificationJob } from "./actions";
import { PageSelect } from "@/components/admin/PageSelect";
import { HelpTip } from "@/components/HelpTip";
import { getScopedPages, requireCapability, sessionHasCapability } from "@/lib/admin-guard";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { IconTile, type Hue } from "@/components/ui/icon-tile";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const CHANNELS = [
  { value: "EMAIL", label: "Email" },
  { value: "SMS", label: "SMS" },
];

const CONTACT_PLACEHOLDER: Record<string, string> = {
  EMAIL: "customer@example.com",
  SMS: "+12025550123",
};

export default async function SubscribersPage({ searchParams }: { searchParams: Promise<{ pageId?: string; channel?: string }> }) {
  const { session, org } = await requireSession();
  await requireCapability("subscriber.manage");
  const { pageId: pageIdParam, channel: channelParam } = await searchParams;
  const pages = await getScopedPages(session, org.id, { isHub: false });
  const pageId = pageIdParam && pages.some((p) => p.id === pageIdParam) ? pageIdParam : pages[0]?.id;

  if (!pageId) {
    const canCreate = sessionHasCapability(session, "page.configure");
    return (
      <div className="space-y-8">
        <PageHeader title="Subscribers" description="Manage who receives status updates from your pages." icon={UsersRound} hue="emerald" />
        <EmptyState
          icon={UsersRound}
          hue="emerald"
          title="Create a page first"
          description="Subscribers follow a status page. Create a page, then add or import the people who should hear about incidents."
          action={canCreate ? <Link href="/organization/pages/new" className={buttonVariants()}><Plus aria-hidden size={16} />Create page</Link> : undefined}
        />
      </div>
    );
  }

  const channel = CHANNELS.some((c) => c.value === channelParam) ? channelParam! : "EMAIL";
  const channelLabel = CHANNELS.find((c) => c.value === channel)?.label ?? channel;

  const allForPage = await database.selectFrom("subscribers").selectAll()
    .where("pageId", "=", pageId).execute();
  const subscribers = allForPage.filter((s) => s.channel === channel);
  const deliveryJobs = await database.selectFrom("notificationJobs").selectAll()
    .where("pageId", "=", pageId).where("channel", "=", channel)
    .orderBy("updatedAt", "desc").limit(20).execute();
  const pendingDeliveryCount = deliveryJobs.filter((job) => ["PENDING", "PROCESSING"].includes(job.status)).length;
  const failedDeliveries = deliveryJobs.filter((job) => job.status === "DEAD_LETTER");
  const countsByChannel = allForPage.reduce<Record<string, number>>((acc, s) => {
    acc[s.channel] = (acc[s.channel] ?? 0) + 1;
    return acc;
  }, {});

  const active = subscribers.filter((s) => s.verified && !s.quarantined).length;
  const quarantined = subscribers.filter((s) => s.quarantined).length;
  const unconfirmed = subscribers.filter((s) => !s.verified).length;
  const addedThisMonth = subscribers.filter((s) => {
    const d = new Date(s.createdAt);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const boundAdd = addSubscriber.bind(null, pageId);
  const boundImport = importSubscribersCsv.bind(null, pageId);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Subscribers"
        description={`${allForPage.length} ${allForPage.length === 1 ? "subscriber follows" : "subscribers follow"} this page. Add, import, and manage who receives updates.`}
        icon={UsersRound}
        hue="emerald"
        actions={
          <div className="w-full sm:w-60">
            <PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/organization/subscribers" selected={pageId} />
          </div>
        }
      />

      <nav aria-label="Subscriber channel" className="flex gap-1 overflow-x-auto border-b border-line">
        {CHANNELS.map((c) => (
          <a
            key={c.value}
            href={`/organization/subscribers?pageId=${pageId}&channel=${c.value}`}
            aria-current={channel === c.value ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold outline-none transition-colors duration-200 focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-primary/25",
              channel === c.value ? "border-primary text-primary-ink" : "border-transparent text-ink-soft hover:text-ink",
            )}
          >
            {c.label}
            {countsByChannel[c.value] ? <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium tabular-nums", channel === c.value ? "bg-primary-soft text-primary-ink" : "bg-sunken text-ink-soft")}>{countsByChannel[c.value]}</span> : null}
          </a>
        ))}
      </nav>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={`${channelLabel} subscribers`} value={subscribers.length} note={`${addedThisMonth} added this month`} icon={UsersRound} hue="emerald" />
        <Stat label="Active" value={active} icon={BadgeCheck} hue="emerald" />
        <Stat label="Quarantined" value={quarantined} icon={ShieldAlert} hue="amber" />
        <Stat label="Unconfirmed" value={unconfirmed} icon={Clock} hue="slate" />
      </div>

      {(pendingDeliveryCount > 0 || failedDeliveries.length > 0) && (
        <Card aria-labelledby="delivery-state-title" role="region">
          <CardHeader>
            <CardTitle id="delivery-state-title">Delivery state</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={pendingDeliveryCount > 0 ? "info" : "neutral"}>{pendingDeliveryCount} queued or processing</StatusBadge>
              <StatusBadge tone={failedDeliveries.length > 0 ? "danger" : "neutral"}>{failedDeliveries.length} recently failed</StatusBadge>
            </CardDescription>
          </CardHeader>
          {failedDeliveries.length > 0 && (
            <CardContent>
              <ul className="space-y-2">
                {failedDeliveries.slice(0, 5).map((job) => (
                  <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-danger/25 bg-danger-bg/40 px-3.5 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{job.contact}</p>
                      <p className="mt-0.5 text-xs text-danger-fg">{job.lastError ?? "Delivery failed"} <span className="text-ink-dim">· attempt {job.attempts}/{job.maxAttempts}</span></p>
                    </div>
                    <form action={retryNotificationJob.bind(null, job.id)}>
                      <Button type="submit" variant="secondary" size="sm">Retry now</Button>
                    </form>
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add subscriber</CardTitle>
            <CardDescription>Subscribe one person to this page by email address or phone number.</CardDescription>
          </CardHeader>
          <form action={boundAdd}>
            <CardContent className="space-y-4">
              <Field label="Channel" htmlFor="add-channel">
                <Select aria-label="Subscriber channel" id="add-channel" name="channel" defaultValue={channel} className="w-full">
                  {CHANNELS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Contact" htmlFor="add-contact">
                <Input id="add-contact" name="contact" placeholder={CONTACT_PLACEHOLDER[channel]} required />
              </Field>
              <div className="flex justify-end border-t border-line pt-4">
                <Button type="submit">
                  <Plus aria-hidden size={16} />
                  Add
                </Button>
              </div>
            </CardContent>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-1.5">
              <CardTitle>Bulk import (CSV)</CardTitle>
              <HelpTip text="Paste comma or newline separated email addresses; administrator imports are treated as verified." />
            </div>
            <CardDescription>Add many email subscribers at once.</CardDescription>
          </CardHeader>
          <form action={boundImport}>
            <CardContent className="space-y-4">
              <Field label="Channel" htmlFor="import-channel">
                <Select aria-label="Import channel" id="import-channel" name="channel" className="w-full">
                  <option value="EMAIL">Email</option>
                </Select>
              </Field>
              <Field label="Email addresses" htmlFor="import-csv">
                <Textarea id="import-csv" name="csv" rows={3} placeholder="one@example.com, two@example.com" />
              </Field>
              <div className="flex justify-end border-t border-line pt-4">
                <Button type="submit" variant="secondary">
                  <Upload aria-hidden size={16} />
                  Import
                </Button>
              </div>
            </CardContent>
          </form>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>{channelLabel} subscribers</CardTitle>
            <CardDescription>{subscribers.length} on this channel</CardDescription>
          </div>
          <a href={`/organization/subscribers/export?pageId=${pageId}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            <Download aria-hidden size={14} />
            Export CSV
          </a>
        </CardHeader>
        <CardContent>
          {subscribers.length === 0 ? (
            <EmptyState
              icon={Mail}
              hue="emerald"
              title={`No ${channelLabel.toLowerCase()} subscribers`}
              description="Subscribers on this channel will appear here once added or confirmed."
              className="border-0 bg-transparent py-8"
            />
          ) : (
            <ul className="space-y-2">
              {subscribers.map((s) => (
                <li key={s.id} className="flex flex-col gap-3 rounded-control border border-line px-3.5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-ink">{s.contact}</span>
                    {!s.verified && <StatusBadge tone="warn">Pending verification</StatusBadge>}
                    {s.quarantined && <StatusBadge tone="danger">Quarantined</StatusBadge>}
                    {s.verified && !s.quarantined && <StatusBadge tone="ok">Active</StatusBadge>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={toggleQuarantine.bind(null, s.id)}>
                      <Button type="submit" variant="secondary" size="sm">
                        {s.quarantined ? <ShieldCheck aria-hidden size={14} /> : <ShieldOff aria-hidden size={14} />}
                        {s.quarantined ? "Unquarantine" : "Quarantine"}
                      </Button>
                    </form>
                    <form action={removeSubscriber.bind(null, s.id)}>
                      <Button type="submit" variant="ghost" size="sm" className="hover:!bg-danger-bg hover:!text-danger-fg [&_svg]:!text-ink-dim hover:[&_svg]:!text-danger-fg">
                        <Trash2 aria-hidden size={14} />
                        Remove
                      </Button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, note, icon, hue }: { label: string; value: number; note?: string; icon: LucideIcon; hue: Hue }) {
  return (
    <div className="rounded-card bg-surface shadow-card ring-1 ring-line/80 p-5">
      <IconTile icon={icon} hue={hue} />
      <p className="mt-4 text-3xl font-extrabold tabular-nums tracking-tight text-ink">{value}</p>
      <p className="mt-0.5 text-sm text-ink-soft">{label}</p>
      {note && <p className="mt-1 text-xs text-ink-dim">{note}</p>}
    </div>
  );
}

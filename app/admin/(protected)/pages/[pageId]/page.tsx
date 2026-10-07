import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowUpRight,
  Boxes,
  CalendarClock,
  ChevronRight,
  Layers3,
  Palette,
  Plus,
  Settings,
  TriangleAlert,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import { SetupSteps, type SetupStep } from "@/components/admin/SetupSteps";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IconTile, type Hue } from "@/components/ui/icon-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { formatPageDate } from "@/lib/page-locale";
import { database } from "@/lib/postgres/client";
import type { PageRow } from "@/lib/postgres/schema";
import { eventHref } from "@/lib/page-events";
import { publicPagePath } from "@/lib/public-path";
import {
  COMPONENT_STATUS_LABEL,
  COMPONENT_STATUS_TONE,
  INCIDENT_STATUS_LABEL,
  MAINTENANCE_STATUS_LABEL,
  overallBanner,
  type ComponentStatus,
  type IncidentStatus,
  type MaintenanceStatus,
} from "@/lib/status";
import { publicAppUrl } from "@/lib/url";
import { cn } from "@/lib/utils";

const ACCESS_LABEL: Record<string, string> = {
  PUBLIC: "Public",
  PRIVATE: "Private (shared password)",
  AUDIENCE: "Audience-specific",
};

function absolutePublicUrl(path: string) {
  try {
    return `${publicAppUrl().replace(/\/+$/, "")}${path}`;
  } catch {
    return path;
  }
}

export default async function PageOverview({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const page = await database.selectFrom("pages").selectAll()
    .where("id", "=", pageId).where("orgId", "=", session.orgId).where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!page) notFound();
  return page.isHub ? <HubOverview page={page} orgId={session.orgId} /> : <StatusPageOverview page={page} />;
}

type OverviewPage = PageRow;

async function StatusPageOverview({ page }: { page: OverviewPage }) {
  const [components, groups, openIncidents, maintenance, subscriberRow] = await Promise.all([
    database.selectFrom("components").select(["id", "name", "status", "visible", "groupId"])
      .where("pageId", "=", page.id).orderBy("order").execute(),
    database.selectFrom("componentGroups").select(["id", "name"]).where("pageId", "=", page.id).execute(),
    database.selectFrom("incidents").select(["id", "name", "status", "createdAt"])
      .where("pageId", "=", page.id).where("isMaintenance", "=", false).where("status", "!=", "RESOLVED")
      .orderBy("createdAt", "desc").limit(5).execute(),
    database.selectFrom("incidents").select(["id", "name", "maintenanceStatus", "scheduledStart", "scheduledEnd"])
      .where("pageId", "=", page.id).where("isMaintenance", "=", true)
      .where("maintenanceStatus", "in", ["SCHEDULED", "IN_PROGRESS", "VERIFYING"])
      .orderBy("scheduledStart", "asc").limit(3).execute(),
    database.selectFrom("subscribers").select(({ fn }) => fn.countAll<number>().as("count"))
      .where("pageId", "=", page.id).where("verified", "=", true).where("quarantined", "=", false)
      .executeTakeFirstOrThrow(),
  ]);

  const visible = components.filter((component) => component.visible);
  const hiddenCount = components.length - visible.length;
  const banner = overallBanner(visible.map((component) => component.status as ComponentStatus));
  const subscribers = Number(subscriberRow.count);
  const groupName = new Map(groups.map((group) => [group.id, group.name]));
  const draft = page.setupCompletedAt === null;
  const live = !draft && page.publicVisible !== false;
  const nextWindow = maintenance[0];
  const date = (value: Date) => formatPageDate(value, { language: page.language, timeZone: page.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const steps: SetupStep[] = [
    { label: "Name your page", state: "done" },
    { label: "Add services", state: visible.length ? "done" : "current" },
    { label: "Publish", state: visible.length ? "current" : "todo" },
  ];
  const base = `/organization/pages/${page.id}`;
  const activeCount = openIncidents.length + maintenance.length;

  return (
    <div className="space-y-6">
      {draft && (
        <Card>
          <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">Finish setting up this page</p>
              <p className="mt-0.5 text-sm text-ink-soft">{visible.length ? "Everything required is in place. Publish when you are ready." : "Add at least one visible service, then publish."}</p>
            </div>
            <SetupSteps label="Setup progress" steps={steps} />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard href={`${base}/content`} icon={Activity} hue="indigo" label="Current status" caption={`${visible.length} visible service${visible.length === 1 ? "" : "s"}${hiddenCount ? `, ${hiddenCount} hidden` : ""}`}>
          {visible.length
            ? <StatusBadge tone={COMPONENT_STATUS_TONE[banner.status]}>{banner.label}</StatusBadge>
            : <span className="text-sm font-semibold text-ink-soft">No services yet</span>}
        </StatCard>
        <StatCard href={`/organization/events?pageId=${page.id}`} icon={TriangleAlert} hue="amber" label="Open incidents" caption="View page events">
          <span className={cn("text-2xl font-bold tabular-nums", openIncidents.length ? "text-danger-fg" : "text-ink")}>{openIncidents.length}</span>
        </StatCard>
        <StatCard href={`/organization/events?pageId=${page.id}`} icon={CalendarClock} hue="sky" label="Maintenance" caption={nextWindow ? MAINTENANCE_STATUS_LABEL[(nextWindow.maintenanceStatus ?? "SCHEDULED") as MaintenanceStatus] : "Schedule a window"}>
          <span className="text-base font-semibold text-ink">{nextWindow?.scheduledStart ? date(nextWindow.scheduledStart) : "None scheduled"}</span>
        </StatCard>
        <StatCard href={`/organization/subscribers?pageId=${page.id}`} icon={UsersRound} hue="emerald" label="Subscribers" caption="Verified and active">
          <span className="text-2xl font-bold tabular-nums text-ink">{subscribers}</span>
        </StatCard>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {activeCount > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Active now</CardTitle>
                <CardDescription>Incidents and maintenance visitors can currently see.</CardDescription>
              </CardHeader>
              <CardContent className="py-2">
                <ul className="divide-y divide-line">
                  {openIncidents.map((incident) => (
                    <OverviewRow key={incident.id} href={eventHref(incident)} title={incident.name} meta={`Opened ${date(incident.createdAt)}`}>
                      <StatusBadge tone="danger">{INCIDENT_STATUS_LABEL[incident.status as IncidentStatus]}</StatusBadge>
                    </OverviewRow>
                  ))}
                  {maintenance.map((window) => (
                    <OverviewRow key={window.id} href={eventHref(window)} title={window.name} meta={window.scheduledStart ? `${date(window.scheduledStart)}${window.scheduledEnd ? ` – ${date(window.scheduledEnd)}` : ""}` : "Maintenance"}>
                      <StatusBadge tone="info">{MAINTENANCE_STATUS_LABEL[(window.maintenanceStatus ?? "SCHEDULED") as MaintenanceStatus]}</StatusBadge>
                    </OverviewRow>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div className="min-w-0">
                <CardTitle>Services</CardTitle>
                <CardDescription>What visitors see for each service right now.</CardDescription>
              </div>
              <Link href={`${base}/content`} className={buttonVariants({ variant: "secondary", size: "sm" })}>Manage services</Link>
            </CardHeader>
            <CardContent className="py-2">
              {components.length ? (
                <ul className="divide-y divide-line">
                  {components.map((component) => (
                    <li key={component.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 truncate text-sm font-medium text-ink">
                          {component.name}
                          {!component.visible && <Badge>Hidden</Badge>}
                        </p>
                        <p className="truncate text-xs text-ink-dim">{component.groupId ? groupName.get(component.groupId) ?? "Ungrouped" : "Ungrouped"}</p>
                      </div>
                      <StatusBadge tone={COMPONENT_STATUS_TONE[component.status as ComponentStatus]} className="shrink-0">{COMPONENT_STATUS_LABEL[component.status as ComponentStatus]}</StatusBadge>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={Boxes} hue="sky" title="No services yet" description="Services are the systems whose health this page shows." action={<Link href={`${base}/content`} className={buttonVariants()}><Plus aria-hidden size={16} />Add a service</Link>} className="py-10" />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <PageDetails page={page} live={live} />
          <Card>
            <CardHeader><CardTitle>Quick actions</CardTitle></CardHeader>
            <CardContent className="py-2">
              <ul className="divide-y divide-line">
                <QuickAction href={`/organization/incidents/new?pageId=${page.id}`} icon={TriangleAlert} label="Report an incident" />
                <QuickAction href={`/organization/maintenance/new?pageId=${page.id}`} icon={Wrench} label="Schedule maintenance" />
                <QuickAction href={`${base}/appearance`} icon={Palette} label="Customize appearance" />
                <QuickAction href={`${base}/settings`} icon={Settings} label="Page settings" />
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

async function HubOverview({ page, orgId }: { page: OverviewPage; orgId: string }) {
  const members = await database.selectFrom("pages").select(["id", "name", "slug", "setupCompletedAt", "publicVisible"])
    .where("orgId", "=", orgId).where("hubParentId", "=", page.id).where("isHub", "=", false).where("deletedAt", "is", null)
    .orderBy("name").execute();
  const published = members.filter((member) => member.setupCompletedAt !== null && member.publicVisible !== false).length;
  const live = page.setupCompletedAt !== null && page.publicVisible !== false;
  const base = `/organization/pages/${page.id}`;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard href={`${base}/content`} icon={Layers3} hue="violet" label="Status pages" caption="In this hub">
          <span className="text-2xl font-bold tabular-nums text-ink">{members.length}</span>
        </StatCard>
        <StatCard href={`${base}/content`} icon={Activity} hue="indigo" label="Published" caption="Visible to visitors">
          <span className="text-2xl font-bold tabular-nums text-ink">{published}</span>
        </StatCard>
        <StatCard href={`${base}/settings`} icon={Settings} hue="slate" label="Access" caption="Who can open the hub">
          <span className="text-base font-semibold text-ink">{ACCESS_LABEL[page.type] ?? page.type}</span>
        </StatCard>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle>Status pages in this hub</CardTitle>
              <CardDescription>Each page keeps its own services and incidents.</CardDescription>
            </div>
            <Link href={`/organization/pages/new?hubParentId=${page.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}><Plus aria-hidden size={14} />Add status page</Link>
          </CardHeader>
          <CardContent className="py-2">
            {members.length ? (
              <ul className="divide-y divide-line">
                {members.map((member) => {
                  const state = member.setupCompletedAt === null ? "Draft" : member.publicVisible === false ? "Hidden" : "Published";
                  return (
                    <OverviewRow key={member.id} href={`/organization/pages/${member.id}`} title={member.name} meta={`/${member.slug}`}>
                      <StatusBadge tone={state === "Published" ? "ok" : state === "Hidden" ? "neutral" : "warn"}>{state}</StatusBadge>
                    </OverviewRow>
                  );
                })}
              </ul>
            ) : (
              <EmptyState icon={Layers3} hue="violet" title="No status pages yet" description="Add a status page to show it in this hub." className="py-10" />
            )}
          </CardContent>
        </Card>
        <PageDetails page={page} live={live} />
      </div>
    </div>
  );
}

function PageDetails({ page, live }: { page: OverviewPage; live: boolean }) {
  const path = publicPagePath(page);
  const url = absolutePublicUrl(path);
  const created = formatPageDate(page.createdAt, { language: page.language, timeZone: page.timezone, dateStyle: "medium" });
  return (
    <Card>
      <CardHeader><CardTitle>Page details</CardTitle></CardHeader>
      <CardContent>
        <dl className="divide-y divide-line text-sm">
          <div className="space-y-1.5 py-3 first:pt-0">
            <dt className="text-xs font-medium text-ink-dim">Public address</dt>
            <dd className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink" title={url}>{url}</span>
              <CopyButton value={url} label="Copy" className={buttonVariants({ variant: "ghost", size: "sm" })} />
              {live && (
                <a href={path} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })} aria-label="Open the live page in a new tab">
                  <ArrowUpRight aria-hidden size={14} />
                </a>
              )}
            </dd>
          </div>
          <DetailRow label="Access" value={ACCESS_LABEL[page.type] ?? page.type} />
          <DetailRow label="Time zone" value={page.timezone || "UTC"} />
          <DetailRow label="Design" value={page.designPublishedAt ? `Version ${page.publishedDesignVersion}, published ${formatPageDate(page.designPublishedAt, { language: page.language, timeZone: page.timezone, dateStyle: "medium" })}` : "Default design"} />
          <DetailRow label="Created" value={created} />
        </dl>
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3 last:pb-0">
      <dt className="shrink-0 text-xs font-medium text-ink-dim">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-ink">{value}</dd>
    </div>
  );
}

function StatCard({ href, icon, hue, label, caption, children }: { href: string; icon: LucideIcon; hue: Hue; label: string; caption: string; children: ReactNode }) {
  return (
    <Link href={href} className="group flex min-w-0 flex-col gap-2 rounded-card border border-line bg-surface p-3 shadow-card sm:gap-3 sm:p-4 outline-none transition-[border-color,box-shadow] duration-200 ease-soft hover:border-line-strong hover:shadow-raised focus-visible:ring-4 focus-visible:ring-primary/25">
      <span className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-dim">{label}</span>
        <IconTile icon={icon} hue={hue} size="sm" />
      </span>
      <span className="flex min-h-8 items-center">{children}</span>
      <span className="flex items-center gap-1 text-xs text-ink-soft group-hover:text-primary-ink">
        {caption}
        <ChevronRight aria-hidden size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function OverviewRow({ href, title, meta, children }: { href: string; title: string; meta: string; children: ReactNode }) {
  return (
    <li>
      <Link href={href} className="-mx-2 flex items-center justify-between gap-3 rounded-control px-2 py-3 outline-none transition-colors duration-200 hover:bg-sunken focus-visible:ring-4 focus-visible:ring-primary/25">
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink">{title}</span>
          <span className="block truncate text-xs text-ink-dim">{meta}</span>
        </span>
        <span className="shrink-0">{children}</span>
      </Link>
    </li>
  );
}

function QuickAction({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <li>
      <Link href={href} className="-mx-2 flex min-h-11 items-center gap-3 rounded-control px-2 text-sm font-medium text-ink outline-none transition-colors duration-200 hover:bg-sunken focus-visible:ring-4 focus-visible:ring-primary/25">
        <Icon aria-hidden size={16} className="text-ink-dim" />
        <span className="flex-1">{label}</span>
        <ChevronRight aria-hidden size={14} className="text-ink-dim" />
      </Link>
    </li>
  );
}

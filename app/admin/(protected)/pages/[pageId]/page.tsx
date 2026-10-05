import Link from "next/link";
import { notFound } from "next/navigation";
import { Boxes, Layers3, LayoutGrid, Palette, Rocket, TriangleAlert, Wrench } from "lucide-react";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { database } from "@/lib/postgres/client";
import { SetupSteps, type SetupStep } from "@/components/admin/SetupSteps";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { StatusBadge } from "@/components/ui/status-badge";

export default async function PageOverview({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const page = await database.selectFrom("pages").selectAll().where("id", "=", pageId).where("orgId", "=", session.orgId).where("deletedAt", "is", null).executeTakeFirst();
  if (!page) notFound();
  const componentCount = page.isHub ? 0 : await database.selectFrom("components").select(({ fn }) => fn.countAll<number>().as("count")).where("pageId", "=", pageId).where("visible", "=", true).executeTakeFirstOrThrow().then((row) => Number(row.count));
  const draft = page.setupCompletedAt === null;
  const state = draft ? "Draft" : page.publicVisible ? "Published" : "Hidden";
  const accessLabel = page.type === "PUBLIC" ? "Public" : page.type === "PRIVATE" ? "Private (shared password)" : "Audience-specific";
  // Hubs hold status pages rather than services, so only status pages can report real progress here.
  const hasServices = !page.isHub && componentCount > 0;
  const steps: SetupStep[] = [
    { label: "Name your page", state: "done" },
    { label: page.isHub ? "Add status pages" : "Add services", state: hasServices ? "done" : "current" },
    { label: "Publish", state: hasServices ? "current" : "todo" },
  ];

  return <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
    <Card>
      <CardHeader className="flex-row items-start gap-3.5">
        <IconTile icon={draft ? Rocket : page.isHub ? Layers3 : LayoutGrid} hue={draft ? "amber" : "violet"} />
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink-dim">{draft ? "Setup" : page.isHub ? "Hub" : "Status page"}</p>
          <CardTitle>{draft ? "Finish your page" : "Page overview"}</CardTitle>
          <CardDescription className="mt-1 max-w-2xl">{page.isHub ? "Group related status pages in this hub." : `${componentCount} visible service${componentCount === 1 ? "" : "s"}.`} {draft ? "Add your services, personalize the page, and publish when you are ready." : page.publicVisible ? "This page is visible to visitors." : "This page is currently hidden from visitors."}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {draft && <SetupSteps label="Setup progress" steps={steps} />}
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-control bg-sunken px-3.5 py-3">
            <dt className="text-xs text-ink-dim">Status</dt>
            <dd className="mt-1"><StatusBadge tone={draft ? "warn" : page.publicVisible ? "ok" : "neutral"}>{state}</StatusBadge></dd>
          </div>
          <div className="rounded-control bg-sunken px-3.5 py-3">
            <dt className="text-xs text-ink-dim">Access</dt>
            <dd className="mt-1 text-sm font-semibold text-ink">{accessLabel}</dd>
          </div>
          <div className="rounded-control bg-sunken px-3.5 py-3">
            <dt className="text-xs text-ink-dim">{page.isHub ? "Contents" : "Services"}</dt>
            <dd className="mt-1 text-sm font-semibold text-ink">{page.isHub ? "Status pages" : `${componentCount} visible`}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-3">
          <Link href={`/organization/pages/${pageId}/content`} className={buttonVariants()}><Boxes aria-hidden size={16} />{page.isHub ? "Manage status pages" : "Manage services"}</Link>
          <Link href={`/organization/pages/${pageId}/appearance`} className={buttonVariants({ variant: "secondary" })}><Palette aria-hidden size={16} />Customize page</Link>
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardHeader className="flex-row items-start gap-3.5">
        <IconTile icon={TriangleAlert} hue="amber" />
        <div className="min-w-0">
          <CardTitle>Incident readiness</CardTitle>
          <CardDescription className="mt-1">Incidents and maintenance remain organization-wide operational workflows.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Link href="/organization/incidents" className={buttonVariants({ variant: "outline" })}><TriangleAlert aria-hidden size={16} />Incidents</Link>
        <Link href="/organization/maintenance" className={buttonVariants({ variant: "outline" })}><Wrench aria-hidden size={16} />Maintenance</Link>
      </CardContent>
    </Card>
  </div>;
}

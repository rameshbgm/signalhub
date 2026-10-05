import Link from "next/link";
import { ArrowLeft, Siren } from "lucide-react";
import { requireSession } from "@/lib/require-session";
import { database } from "@/lib/postgres/client";
import { createIncident } from "../actions";
import { IncidentForm } from "@/components/admin/IncidentForm";
import { PageSelect } from "@/components/admin/PageSelect";
import { NoPagesState } from "@/components/admin/operate-ui";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { getScopedPages, requireCapability, sessionHasCapability } from "@/lib/admin-guard";

export default async function NewIncidentPage({ searchParams }: { searchParams: Promise<{ pageId?: string }> }) {
  const { session, org } = await requireSession();
  await requireCapability("incident.manage");
  const { pageId: pageIdParam } = await searchParams;
  const pages = await getScopedPages(session, org.id, { isHub: false });
  const pageId = pageIdParam && pages.some((p) => p.id === pageIdParam) ? pageIdParam : pages[0]?.id;

  const components = pageId
    ? await database.selectFrom("components").selectAll().where("pageId", "=", pageId).orderBy("order", "asc").execute()
    : [];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Declare incident"
        icon={Siren}
        hue="amber"
        description="Pick the page, describe what is wrong, and choose which components are affected."
        actions={
          <Link href="/organization/incidents" className={buttonVariants({ variant: "secondary" })}>
            <ArrowLeft aria-hidden size={16} />
            All incidents
          </Link>
        }
      />

      {pageId ? (
        <>
          <Card>
            <CardContent>
              <Field label="Page" hint="The incident is published to this status page.">
                <PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/organization/incidents/new" selected={pageId} />
              </Field>
            </CardContent>
          </Card>
          <IncidentForm action={createIncident} pageId={pageId} components={components} />
        </>
      ) : (
        <NoPagesState description="Incidents are published to a status page. Create one before you declare an incident." canCreate={sessionHasCapability(session, "page.configure")} />
      )}
    </div>
  );
}

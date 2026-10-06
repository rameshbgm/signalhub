import Link from "next/link";
import { ArrowLeft, Wrench } from "lucide-react";
import { requireSession } from "@/lib/require-session";
import { database } from "@/lib/postgres/client";
import { createMaintenance } from "../actions";
import { MaintenanceForm } from "@/components/admin/MaintenanceForm";
import { PageSelect } from "@/components/admin/PageSelect";
import { NoPagesState } from "@/components/admin/operate-ui";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { getScopedPages, requireCapability, sessionHasCapability } from "@/lib/admin-guard";

export default async function NewMaintenancePage({ searchParams }: { searchParams: Promise<{ pageId?: string }> }) {
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
        title="Schedule maintenance"
        icon={Wrench}
        hue="amber"
        description="Pick the page, set the window, and tell subscribers what to expect."
        actions={
          <Link href="/organization/maintenance" className={buttonVariants({ variant: "secondary" })}>
            <ArrowLeft aria-hidden size={16} />
            All maintenance
          </Link>
        }
      />

      {pageId ? (
        <>
          <Card>
            <CardContent>
              <Field label="Page" hint="The maintenance window is announced on this status page.">
                <PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/organization/maintenance/new" selected={pageId} />
              </Field>
            </CardContent>
          </Card>
          <MaintenanceForm action={createMaintenance} pageId={pageId} components={components} timeZone={pages.find((p) => p.id === pageId)?.timezone || "UTC"} />
        </>
      ) : (
        <NoPagesState description="Maintenance windows are announced on a status page. Create one before you schedule maintenance." canCreate={sessionHasCapability(session, "page.configure")} />
      )}
    </div>
  );
}

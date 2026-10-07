import Link from "next/link";
import { ArrowLeft, Wrench } from "lucide-react";
import { requireSession } from "@/lib/require-session";
import { database } from "@/lib/postgres/client";
import { createMaintenance } from "../actions";
import { MaintenanceForm } from "@/components/admin/MaintenanceForm";
import { NoPagesState, PostingTo } from "@/components/admin/operate-ui";
import { buttonVariants } from "@/components/ui/button";
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
        description="Set the window and tell subscribers what to expect."
        actions={
          <Link href={pageId ? `/organization/events?pageId=${pageId}` : "/organization/events"} className={buttonVariants({ variant: "secondary" })}>
            <ArrowLeft aria-hidden size={16} />
            Back to events
          </Link>
        }
      />

      {pageId ? (
        <>
          <PostingTo pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/organization/maintenance/new" selected={pageId} />
          <MaintenanceForm action={createMaintenance} pageId={pageId} components={components} timeZone={pages.find((p) => p.id === pageId)?.timezone || "UTC"} />
        </>
      ) : (
        <NoPagesState description="Maintenance windows are announced on a status page. Create one before you schedule maintenance." canCreate={sessionHasCapability(session, "page.configure")} />
      )}
    </div>
  );
}

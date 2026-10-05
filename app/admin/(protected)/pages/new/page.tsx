import Link from "next/link";
import { ArrowLeft, PanelsTopLeft } from "lucide-react";
import { NewPageBasicsForm } from "@/components/admin/NewPageBasicsForm";
import { SetupSteps } from "@/components/admin/SetupSteps";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { requireCapability } from "@/lib/admin-guard";
import { database } from "@/lib/postgres/client";
import { createPage } from "../actions";

export default async function NewPage({ searchParams }: { searchParams: Promise<{ hubParentId?: string }> }) {
  const session = await requireCapability("page.configure");
  const { hubParentId = "" } = await searchParams;
  const hubs = await database.selectFrom("pages").select(["id", "name"])
    .where("orgId", "=", session.orgId).where("isHub", "=", true).where("deletedAt", "is", null)
    .orderBy("createdAt", "asc").execute();
  const validInitialHub = hubs.some((hub) => hub.id === hubParentId) ? hubParentId : "";
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-4 sm:px-6 sm:pt-8">
      <Link href="/organization/pages" className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-3 max-sm:min-h-10" })}>
        <ArrowLeft aria-hidden size={16} />
        Back to pages
      </Link>
      <SetupSteps
        label="Page creation steps"
        className="mt-5"
        steps={[
          { label: "Name your page", state: "current" },
          { label: "Add services", state: "todo" },
          { label: "Publish", state: "todo" },
        ]}
      />
      <Card className="mt-6 overflow-hidden rounded-sheet shadow-raised">
        <div aria-hidden="true" className="h-1.5 bg-gradient-to-r from-primary to-accent" />
        <div className="p-6 sm:p-10">
          <header>
            <IconTile icon={PanelsTopLeft} hue="violet" size="lg" />
            <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">New page</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-ink-soft">Start with a name. You can add services, control access, and shape the public experience next.</p>
          </header>
          <div className="mt-8">
            <NewPageBasicsForm action={createPage} hubs={hubs} initialHubParentId={validInitialHub} />
          </div>
        </div>
      </Card>
    </div>
  );
}

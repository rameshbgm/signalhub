import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { PlatformSubmitButton } from "@/components/platform/PlatformSubmitButton";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { activePageFilter } from "@/lib/page-lifecycle";
import { finishPageSetup, setPagePublicVisibility } from "../actions";

export default async function PageOverview({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const page = await collections.pages().findOne(activePageFilter({ _id: oid(pageId), orgId: oid(session.orgId) }));
  if (!page) notFound();

  const [visibleServices, memberPages] = await Promise.all([
    page.isHub ? Promise.resolve(0) : collections.components().countDocuments({ pageId: page._id, visible: true }),
    page.isHub ? collections.pages().countDocuments(activePageFilter({ orgId: page.orgId, hubParentId: page._id, isHub: false })) : Promise.resolve(0),
  ]);
  const draft = page.setupCompletedAt === null;
  const canPublish = page.isHub || visibleServices > 0;
  const visibilityAction = draft
    ? finishPageSetup.bind(null, pageId)
    : setPagePublicVisibility.bind(null, pageId, page.publicVisible === false);

  return (
    <div className="space-y-5">
      {draft && (
        <section className="border border-[var(--cyan)]/30 bg-[var(--cyan-soft)] p-5">
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-[var(--cyan)]">Creation draft</p>
          <h2 className="mt-1 font-mono text-lg font-semibold text-[var(--fg)]">Finish the essentials, then publish</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--fg-soft)]">Your public URL remains unavailable while this page is a draft. You can leave and return without losing saved work.</p>
        </section>
      )}

      <section className="border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-mono font-semibold text-[var(--fg)]">{draft ? "Setup checklist" : "Page overview"}</h2>
            <p className="mt-1 text-sm text-[var(--fg-dim)]">The most common page tasks are separated into focused sections.</p>
          </div>
          <span className="font-mono text-xs text-[var(--fg-dim)]">{page.isHub ? `${memberPages} status page${memberPages === 1 ? "" : "s"}` : `${visibleServices} visible service${visibleServices === 1 ? "" : "s"}`}</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <ChecklistItem href={`/organization/pages/${pageId}/settings`} done title="Page details" description="Name, public copy, locale, and legal links." />
          <ChecklistItem href={`/organization/pages/${pageId}/content`} done={page.isHub || visibleServices > 0} title={page.isHub ? "Status pages" : "Services"} description={page.isHub ? "Add status pages now or after publishing." : "At least one visible service is required to publish."} />
          <ChecklistItem href={`/organization/pages/${pageId}/appearance`} done title="Appearance" description="Logo, cover image, style, and brand color." optional />
          <ChecklistItem href={`/organization/pages/${pageId}/notifications`} done title="Notifications" description="Subscriber channels, team destinations, and webhooks." optional />
        </div>
      </section>

      <section className="flex flex-col gap-4 border border-[var(--line)] bg-[var(--surface)] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-mono font-semibold text-[var(--fg)]">{draft ? "Publish page" : "Public visibility"}</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--fg-dim)]">
            {draft
              ? page.isHub
                ? "This hub can be published now. Status pages can be added before or after launch."
                : canPublish ? "The page is ready to publish." : "Add at least one visible service before publishing."
              : page.publicVisible === false ? "This page is hidden from visitors." : "This page is available on its public URL."}
          </p>
        </div>
        <PlatformActionForm action={visibilityAction} successMessage={draft || page.publicVisible === false ? "Page published" : "Page hidden"}>
          <PlatformSubmitButton
            disabled={draft && !canPublish}
            pendingLabel={draft || page.publicVisible === false ? "Publishing…" : "Hiding…"}
            confirmMessage={!draft && page.publicVisible !== false ? `Hide ${page.name} from the public?` : undefined}
            className="shrink-0 border border-[var(--cyan)]/40 px-4 py-2 text-sm font-semibold text-[var(--cyan)] hover:bg-[var(--cyan-soft)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {draft ? "Finish & publish" : page.publicVisible === false ? "Publish publicly" : "Hide from public"}
          </PlatformSubmitButton>
        </PlatformActionForm>
      </section>

      <section className="flex flex-col gap-4 border border-[var(--line)] bg-[var(--surface)] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-mono font-semibold text-[var(--fg)]">Incident readiness</h2>
          <p className="mt-1 text-sm text-[var(--fg-dim)]">Incidents and maintenance remain organization-wide operational workflows.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/organization/incidents" className="border border-[var(--cyan)]/30 px-3 py-2 text-sm font-semibold text-[var(--cyan)]">Incidents</Link>
          <Link href="/organization/maintenance" className="border border-[var(--cyan)]/30 px-3 py-2 text-sm font-semibold text-[var(--cyan)]">Maintenance</Link>
        </div>
      </section>
    </div>
  );
}

function ChecklistItem({ href, title, description, done, optional = false }: { href: string; title: string; description: string; done: boolean; optional?: boolean }) {
  return (
    <Link href={href} className="flex gap-3 border border-[var(--line)] bg-[var(--bg)] p-4 hover:border-[var(--cyan)]">
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${done ? "bg-[var(--green-soft)] text-[var(--green)]" : "bg-[var(--amber-soft)] text-[var(--amber)]"}`}>{done ? "✓" : "!"}</span>
      <span>
        <span className="font-semibold text-[var(--fg)]">{title}{optional && <span className="ml-2 text-[10px] uppercase tracking-wider text-[var(--fg-dim)]">Optional</span>}</span>
        <span className="mt-1 block text-xs leading-5 text-[var(--fg-dim)]">{description}</span>
      </span>
    </Link>
  );
}

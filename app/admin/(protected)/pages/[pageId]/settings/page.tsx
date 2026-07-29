import { notFound } from "next/navigation";
import { HelpTip } from "@/components/HelpTip";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { PlatformSubmitButton } from "@/components/platform/PlatformSubmitButton";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { activePageFilter } from "@/lib/page-lifecycle";
import { pageDesignFor } from "@/lib/page-design";
import { deletePage, updatePageGeneralSettings } from "../../actions";

export default async function PageSettings({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const page = await collections.pages().findOne(activePageFilter({ _id: oid(pageId), orgId: oid(session.orgId) }));
  if (!page) notFound();
  const design = pageDesignFor(page);
  return (
    <div className="space-y-5">
      <PlatformActionForm action={updatePageGeneralSettings.bind(null, pageId)} successMessage="Page settings saved" className="space-y-5">
        <section className="border border-[var(--line)] bg-[var(--surface)] p-5">
          <h2 className="font-mono font-semibold">Page details</h2>
          <p className="mt-1 text-sm text-[var(--fg-dim)]">Identity and public copy are managed here, separate from visual layout.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Page name"><input name="name" defaultValue={page.name} required maxLength={120} className={inputClass} /></Field>
            <Field label="Headline"><input name="headline" defaultValue={page.headline} maxLength={180} className={inputClass} /></Field>
            <Field label="About text" full><textarea name="aboutText" defaultValue={page.aboutText} maxLength={4000} rows={4} className={inputClass} /></Field>
            <Field label="Support URL"><input name="supportUrl" defaultValue={page.supportUrl ?? ""} inputMode="url" pattern="(?:https?://.+|mailto:.+)" className={inputClass} /></Field>
            <Field label="Terms of Service URL"><input name="termsUrl" type="url" defaultValue={page.termsUrl ?? ""} className={inputClass} /></Field>
            <Field label="Privacy Policy URL"><input name="privacyUrl" type="url" defaultValue={page.privacyUrl ?? ""} className={inputClass} /></Field>
            <Field label="Timezone"><input name="timezone" defaultValue={page.timezone} className={inputClass} /></Field>
            <Field label="Language"><input name="language" defaultValue={page.language} required pattern="[a-z]{2,3}(?:-[A-Z]{2})?" title="Use a language code such as en or en-US" className={inputClass} /></Field>
          </div>
        </section>

        <section className="border border-[var(--line)] bg-[var(--surface)] p-5">
          <h2 className="font-mono font-semibold">Search and sharing</h2>
          <div className="mt-4 grid gap-4">
            <Field label="Search title"><input name="seoTitle" defaultValue={design.seo.title} maxLength={160} className={inputClass} /></Field>
            <Field label="Search description"><textarea name="seoDescription" defaultValue={design.seo.description} maxLength={320} rows={3} className={inputClass} /></Field>
            <Field label="Social image URL"><input name="seoSocialImageUrl" defaultValue={design.seo.socialImageUrl ?? ""} inputMode="url" placeholder="https://example.com/status-card.png" className={inputClass} /></Field>
            <label className="flex items-center gap-2 text-sm text-[var(--fg-soft)]"><input type="checkbox" name="noIndex" defaultChecked={design.seo.noIndex} /> Ask search engines not to index this page</label>
          </div>
        </section>

        <section className="border border-[var(--line)] bg-[var(--surface)] p-5">
          <h2 className="font-mono font-semibold">Page options</h2>
          <div className="mt-4 space-y-3">
            <label className="flex items-center gap-2 text-sm text-[var(--fg-soft)]"><input type="checkbox" name="removeBranding" defaultChecked={page.removeBranding} /> Remove &quot;Powered by&quot; branding</label>
            <label className="flex items-center gap-2 text-sm text-[var(--fg-soft)]"><input type="checkbox" name="analyticsEnabled" defaultChecked={page.analyticsEnabled ?? true} /> Privacy-first page analytics</label>
          </div>
          {page.customCss && <p className="mt-4 border border-[var(--amber)]/30 bg-[var(--amber-soft)] p-3 text-sm text-[var(--amber)]">Legacy custom CSS remains active and frozen. It can be reset from Advanced designer.</p>}
        </section>

        <div className="flex justify-end"><PlatformSubmitButton pendingLabel="Saving settings…" className="bg-[var(--cyan)] px-5 py-2.5 text-sm font-semibold text-[var(--on-cyan)]">Save settings</PlatformSubmitButton></div>
      </PlatformActionForm>

      <section className="border border-[var(--red)]/30 bg-[var(--surface)] p-5">
        <h2 className="font-mono font-semibold text-[var(--red)]">Danger zone</h2>
        <p className="mt-1 text-sm text-[var(--fg-dim)]">Deleted pages become unavailable but can be restored by an administrator.</p>
        <form action={deletePage.bind(null, pageId)} className="mt-4 flex items-center gap-2">
          <PlatformSubmitButton pendingLabel="Deleting…" confirmMessage={`Delete ${page.name}? This page will become unavailable to everyone. An administrator can restore it from Deleted Pages.`} className="border border-[var(--red)]/40 px-3 py-2 text-sm font-semibold text-[var(--red)]">{page.setupCompletedAt === null ? "Delete this draft" : "Delete this page"}</PlatformSubmitButton>
          <HelpTip text="Soft-deletes this page and makes it inaccessible. Administrators can restore it from Deleted Pages." />
        </form>
      </section>
    </div>
  );
}

const inputClass = "mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none";

function Field({ label, children, full = false }: { label: string; children: React.ReactNode; full?: boolean }) {
  return <label className={`block text-xs text-[var(--fg-soft)] ${full ? "sm:col-span-2" : ""}`}>{label}{children}</label>;
}

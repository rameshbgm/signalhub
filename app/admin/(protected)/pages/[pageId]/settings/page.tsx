import { notFound } from "next/navigation";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { PlatformSubmitButton } from "@/components/platform/PlatformSubmitButton";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { deletePage, updatePageInfo } from "../../actions";

const inputClass = "mt-1.5 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3.5 py-3 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none";

export default async function PageSettings({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const session = await requireCapability("page.configure", pageId);
  const page = await assertPageInOrg(pageId, session.orgId);
  if (!page) notFound();

  return (
    <div className="max-w-3xl space-y-8">
      <PlatformActionForm action={updatePageInfo.bind(null, pageId)} successMessage="Page settings saved" className="space-y-6">
        <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_1px_3px_rgba(60,64,67,0.12)] sm:p-8">
          <div className="max-w-2xl">
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--fg)]">Page details</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--fg-dim)]">Update the essential details visitors and your team use to identify this page.</p>
          </div>
          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            <Field label="Page name"><input name="name" defaultValue={page.name} required maxLength={120} className={inputClass} /></Field>
            <Field label="Organization name"><input name="organizationName" defaultValue={page.organizationName} maxLength={120} className={inputClass} /></Field>
            <Field label="Company website"><input name="companyUrl" defaultValue={page.companyUrl ?? ""} inputMode="url" className={inputClass} /></Field>
            <Field label="Timezone"><input name="timezone" defaultValue={page.timezone} className={inputClass} /></Field>
            <Field label="Default SMS country code"><input name="defaultSmsCountryCode" defaultValue={page.defaultSmsCountryCode} className={inputClass} /></Field>
            <Field label="Google Analytics ID"><input name="googleAnalyticsId" defaultValue={page.googleAnalyticsId ?? ""} className={inputClass} /></Field>
          </div>
          <label className="mt-6 flex items-center gap-2 text-sm text-[var(--fg-soft)]"><input type="checkbox" name="noindex" defaultChecked={page.noindex} /> Ask search engines not to index this page</label>
        </section>
        <div className="flex flex-col-reverse gap-4 border-t border-[var(--line)] pt-6 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-[var(--fg-dim)]">Changes are saved to this page only.</p><PlatformSubmitButton pendingLabel="Saving…" className="w-full rounded-lg bg-[var(--cyan)] px-6 py-3 text-sm font-semibold text-[var(--on-cyan)] sm:w-auto">Save changes</PlatformSubmitButton></div>
      </PlatformActionForm>

      <section className="rounded-xl border border-[var(--red)]/30 bg-[var(--surface)] p-6 sm:p-8">
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--red)]">Delete page</h2>
        <p id="delete-page-warning" className="mt-1 text-sm leading-6 text-[var(--fg-dim)]">Permanently deletes this page, its services, incidents, subscriber records, metrics, monitors, and uploaded assets. This cannot be undone.</p>
        <PlatformActionForm action={deletePage.bind(null, pageId)} successMessage="Page deleted" className="mt-4 flex max-w-lg flex-col gap-3">
          <label className="text-sm text-[var(--fg-soft)]" htmlFor="delete-page-confirmation">Type <code className="font-mono text-[var(--fg)]">{page.name}</code> to confirm</label>
          <input id="delete-page-confirmation" name="confirmation" autoComplete="off" required aria-describedby="delete-page-warning" className="w-full rounded-md border border-[var(--red)]/40 bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--red)] focus:outline-none" />
          <PlatformSubmitButton pendingLabel="Deleting permanently…" confirmMessage={`Permanently delete ${page.name} and all of its data? This cannot be undone.`} className="w-fit border border-[var(--red)]/40 px-4 py-2 text-sm font-semibold text-[var(--red)]">Delete permanently</PlatformSubmitButton>
        </PlatformActionForm>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-medium text-[var(--fg-soft)]">{label}{children}</label>;
}

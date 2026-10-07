import { notFound } from "next/navigation";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { PlatformSubmitButton } from "@/components/platform/PlatformSubmitButton";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { deletePage, updatePageInfo } from "../../actions";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";

export default async function PageSettings({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const session = await requireCapability("page.configure", pageId);
  const page = await assertPageInOrg(pageId, session.orgId);
  if (!page) notFound();

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader><CardTitle>Page details</CardTitle><CardDescription>Update the details visitors and your team use to identify this page.</CardDescription></CardHeader>
        <CardContent>
          <PlatformActionForm action={updatePageInfo.bind(null, pageId)} successMessage="Page settings saved" className="space-y-5">
            <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
              <Field label="Page name" htmlFor="page-name" required><Input id="page-name" name="name" defaultValue={page.name} required maxLength={120} /></Field>
              <Field label="Headline" htmlFor="page-headline" hint="The large title on the public page."><Input id="page-headline" name="headline" defaultValue={page.headline ?? ""} maxLength={180} placeholder="Service status" /></Field>
              <Field label="About this page" htmlFor="page-about" hint="Optional. Shown under the headline and used as the default search description." className="sm:col-span-2"><Textarea id="page-about" name="aboutText" defaultValue={page.aboutText ?? ""} maxLength={4000} rows={3} /></Field>
              <Field label="Organization name" htmlFor="organization-name"><Input id="organization-name" name="organizationName" defaultValue={page.organizationName} maxLength={120} /></Field>
              <Field label="Company website" htmlFor="company-website"><Input id="company-website" name="companyUrl" defaultValue={page.companyUrl ?? ""} inputMode="url" /></Field>
              <Field label="Timezone" htmlFor="page-timezone" hint="IANA name such as Europe/Berlin. Used for public dates and maintenance windows.">
                <Input id="page-timezone" name="timezone" defaultValue={page.timezone} list="page-timezones" required />
                <datalist id="page-timezones">{Intl.supportedValuesOf("timeZone").map((zone) => <option key={zone} value={zone} />)}</datalist>
              </Field>
              <Field label="Default SMS country code" htmlFor="sms-country-code"><Input id="sms-country-code" name="defaultSmsCountryCode" defaultValue={page.defaultSmsCountryCode} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-soft"><Checkbox name="noindex" defaultChecked={page.noindex} /> Ask search engines not to index this page</label>
            <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-ink-dim">Changes are saved to this page only.</p><PlatformSubmitButton pendingLabel="Saving…" className="w-full sm:w-auto">Save changes</PlatformSubmitButton></div>
          </PlatformActionForm>
        </CardContent>
      </Card>

      <Card id="delete-page" className="scroll-mt-24 border-danger/30">
        <CardHeader><CardTitle className="text-danger-fg">Delete page</CardTitle><CardDescription id="delete-page-warning">Permanently deletes this page, its services, incidents, subscriber records, metrics, monitors, and uploaded assets. This cannot be undone.</CardDescription></CardHeader>
        <CardContent><PlatformActionForm action={deletePage.bind(null, pageId)} successMessage="Page deleted" className="flex max-w-lg flex-col gap-3">
          <Field label={<>Type <code className="font-mono text-ink">{page.name}</code> to confirm</>} htmlFor="delete-page-confirmation"><Input id="delete-page-confirmation" name="confirmation" autoComplete="off" required aria-describedby="delete-page-warning" /></Field>
          <PlatformSubmitButton pendingLabel="Deleting permanently…" confirmMessage={`Permanently delete ${page.name} and all of its data? This cannot be undone.`} variant="destructive" className="w-fit">Delete permanently</PlatformSubmitButton>
        </PlatformActionForm></CardContent>
      </Card>
    </div>
  );
}

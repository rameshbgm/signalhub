import Link from "next/link";
import { FluentSelect } from "@/components/FluentSelect";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { SetupStepper } from "@/components/admin/SetupStepper";
import { LayoutPicker } from "@/components/admin/LayoutPicker";
import { saveSetupBranding } from "../actions";
import { AssetUploader } from "@/components/admin/AssetUploader";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";

export default async function SetupLogoPage({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const pageDoc = await collections.pages().findOne({ _id: oid(pageId) });
  const page = toId(pageDoc!);
  const boundSave = saveSetupBranding.bind(null, pageId);

  return (
    <div>
      <SetupStepper pageId={pageId} current="logo" />
      <h1 className="font-mono text-2xl font-semibold text-[var(--fg)]">Add your logo</h1>
      <p className="mt-3 text-sm text-[var(--fg-soft)] leading-relaxed max-w-lg">
        Your logo and brand color appear on your public status page and in every notification email. Pick a layout, upload your
        brand assets, and choose the color that matches your brand.
      </p>

      <form action={boundSave} className="mt-8 space-y-6">
        <LayoutPicker defaultValue={page.layout ?? "STANDARD"} brandColor={page.brandColor} />
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-xs text-[var(--fg-dim)] block mb-1">Brand color</span>
            <input name="brandColor" type="color" defaultValue={page.brandColor} className="h-9 w-20 border border-[var(--line)] bg-[var(--bg)]" />
          </label>
          <div className="block text-sm">
            <span className="text-xs text-[var(--fg-dim)] block mb-1">Theme preset</span>
            <FluentSelect aria-label="Theme preset" name="themePreset" defaultValue={page.themePreset ?? "SIGNAL"} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm">
              <option value="SIGNAL">Signal</option>
              <option value="CALM">Calm</option>
              <option value="CONTRAST">High contrast</option>
            </FluentSelect>
          </div>
          <div className="block text-sm">
            <span className="text-xs text-[var(--fg-dim)] block mb-1">Color mode</span>
            <FluentSelect aria-label="Color mode" name="themeMode" defaultValue={page.themeMode ?? "SYSTEM"} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm">
              <option value="SYSTEM">Follow visitor system</option>
              <option value="LIGHT">Always light</option>
              <option value="DARK">Always dark</option>
            </FluentSelect>
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--fg-soft)] sm:col-span-2">
            <input type="checkbox" name="allowThemeOverride" defaultChecked={page.allowThemeOverride ?? true} />
            Let visitors switch light and dark mode
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <AssetUploader
            pageId={pageId}
            kind="LOGO"
            currentUrl={page.logoUrl}
            label="Upload logo"
            help="Wide and square logos are preserved without cropping. PNG, JPEG, WebP, or AVIF up to 2 MB."
          />
          <AssetUploader
            pageId={pageId}
            kind="FAVICON"
            currentUrl={page.faviconUrl}
            label="Upload favicon"
            help="Use a compact square PNG, WebP, or ICO up to 512 KB."
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center pt-6 border-t border-[var(--line)]">
          <Link href={`/organization/pages/${pageId}/setup/components`} className="text-sm text-[var(--fg-soft)] hover:text-[var(--fg)]">
            ← Back
          </Link>
          <div className="flex gap-3 items-center">
            <Link href={`/organization/pages/${pageId}/setup/notifications`} className="text-sm text-[var(--fg-soft)] hover:text-[var(--fg)] self-center">
              Skip
            </Link>
            <button className="bg-[var(--cyan)] text-[var(--on-cyan)] px-5 py-2.5 text-sm font-semibold font-mono">Next: Notifications →</button>
          </div>
        </div>
      </form>
    </div>
  );
}

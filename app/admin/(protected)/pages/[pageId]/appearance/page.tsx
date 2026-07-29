import Link from "next/link";
import { notFound } from "next/navigation";
import { AssetUploader } from "@/components/admin/AssetUploader";
import { PageAppearanceForm } from "@/components/admin/PageAppearanceForm";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { activePageFilter } from "@/lib/page-lifecycle";
import { PAGE_THEME_PRESET_DESCRIPTIONS, PAGE_THEME_PRESET_KEYS, PAGE_THEME_PRESET_LABELS, pageDesignFor, pageThemePreset } from "@/lib/page-design";
import { updatePageAppearance } from "../../actions";

export default async function PageAppearance({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const page = await collections.pages().findOne(activePageFilter({ _id: oid(pageId), orgId: oid(session.orgId) }));
  if (!page) notFound();
  const design = pageDesignFor(page);
  const presetTheme = pageThemePreset(design.theme.preset);
  const customized = design.theme.typography !== presetTheme.typography || design.theme.density !== presetTheme.density || design.theme.contentWidth !== presetTheme.contentWidth || design.theme.radius !== presetTheme.radius || design.theme.shadow !== presetTheme.shadow || design.theme.palette.background !== presetTheme.palette.background || design.theme.palette.surface !== presetTheme.palette.surface || design.theme.palette.text !== presetTheme.palette.text;
  const presets = PAGE_THEME_PRESET_KEYS.map((key) => {
    const theme = pageThemePreset(key);
    return { key, label: PAGE_THEME_PRESET_LABELS[key], description: PAGE_THEME_PRESET_DESCRIPTIONS[key], colors: [theme.palette.background, theme.palette.surface, theme.palette.brand, theme.palette.text] };
  });
  return (
    <div className="space-y-5">
      <section className="border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><h2 className="font-mono font-semibold text-[var(--fg)]">Brand essentials</h2><p className="mt-1 max-w-2xl text-sm text-[var(--fg-dim)]">Handle everyday branding here. Use Advanced designer for layout, blocks, typography, spacing, and detailed colors.</p></div>
          <Link href={`/organization/pages/${pageId}/design`} className="shrink-0 border border-[var(--cyan)]/40 px-4 py-2 text-sm font-semibold text-[var(--cyan)] hover:bg-[var(--cyan-soft)]">Open advanced designer →</Link>
        </div>
        <div className="mt-5 grid gap-4 border-t border-[var(--line)] pt-5 sm:grid-cols-2">
          <AssetUploader pageId={pageId} kind="LOGO" currentUrl={page.logoUrl} label="Logo" help="Preserves the original aspect ratio." />
          <AssetUploader pageId={pageId} kind="FAVICON" currentUrl={page.faviconUrl} label="Favicon" help="Shown in supported browsers and feeds." />
          <AssetUploader pageId={pageId} kind="COVER" currentUrl={page.coverImageUrl} currentCoverFit={page.coverImageFit} currentCoverPositionX={page.coverImagePositionX} currentCoverPositionY={page.coverImagePositionY} currentCoverCropX={page.coverImageCropX} currentCoverCropY={page.coverImageCropY} currentCoverCropWidth={page.coverImageCropWidth} currentCoverCropHeight={page.coverImageCropHeight} label="Cover image" help="Used by layouts with a wide visual banner." />
        </div>
      </section>
      <section className="border border-[var(--line)] bg-[var(--surface)] p-5">
        <PageAppearanceForm action={updatePageAppearance.bind(null, pageId)} presets={presets} initialPreset={design.theme.preset} initialBrandColor={design.theme.palette.brand} initialMode={design.theme.mode} initialAllowVisitorMode={design.theme.allowVisitorMode} customized={customized} />
      </section>
    </div>
  );
}

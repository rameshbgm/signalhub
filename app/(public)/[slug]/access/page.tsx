import { notFound, redirect } from "next/navigation";
import { collections } from "@/lib/db";
import { toId } from "@/lib/mongo-utils";
import { checkPageAccess } from "@/lib/access";
import { AccessForm } from "@/components/public/AccessForm";
import { pageDesignFor } from "@/lib/page-design";
import { PageDesignShell } from "@/components/public/PageDesignShell";
import { PageSurfaceLayout } from "@/components/public/PageSurfaceLayout";
import { PublicFooter, PublicHeader } from "@/components/public/PublicChrome";
import type { PageDesignBlock } from "@/lib/page-design";
import { scopeCustomCss } from "@/lib/custom-css";
import { publicPageFilter } from "@/lib/page-lifecycle";

export default async function AccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { slug } = await params;
  const requestedReturnTo = (await searchParams).returnTo;
  const returnTo = requestedReturnTo?.startsWith("/") && !requestedReturnTo.startsWith("//")
    ? requestedReturnTo
    : `/${slug}`;
  const pageDoc = await collections.pages().findOne(publicPageFilter({ slug }));
  if (!pageDoc) notFound();
  const page = toId(pageDoc);
  const design = pageDesignFor(pageDoc);
  if (page.type === "PUBLIC") redirect(returnTo);

  const access = await checkPageAccess(page);
  if (!access.ok && access.reason === "unavailable") notFound();
  if (access.ok) redirect(returnTo);
  function renderBlock(block: PageDesignBlock) {
    if (block.type === "ACCESS_FORM") {
      return <div className={block.settings.style === "CENTERED" ? "mx-auto max-w-md" : ""}><AccessForm slug={slug} type={page.type as "PRIVATE" | "AUDIENCE"} returnTo={returnTo} /></div>;
    }
    if (block.type === "RICH_TEXT") return <article className={`page-panel border border-[var(--line)] bg-[var(--surface)] p-[var(--page-block-padding)] ${block.settings.align === "CENTER" ? "text-center" : ""}`}>{block.settings.heading && <h1 className="text-xl font-semibold">{block.settings.heading}</h1>}<p className="mt-2 whitespace-pre-wrap text-sm text-[var(--fg-soft)]">{block.settings.body}</p></article>;
    if (block.type === "LINK_CARDS") return <div className="grid gap-3 sm:grid-cols-2">{block.settings.links.map((link) => <a key={link.url} href={link.url} className="page-panel border border-[var(--line)] bg-[var(--surface)] p-4"><strong>{link.label}</strong><p className="text-sm text-[var(--fg-soft)]">{link.description}</p></a>)}</div>;
    return null;
  }

  return (
    <PageDesignShell pageId={page.id} publishedVersion={page.publishedDesignVersion} design={design} customCss={scopeCustomCss(page.customCss, page.id)} language={page.language}>
      <PublicHeader name={page.name} logoUrl={page.logoUrl} supportUrl={page.supportUrl} layout={page.layout} coverImageUrl={page.coverImageUrl} coverImageFit={page.coverImageFit} coverImagePositionX={page.coverImagePositionX} coverImagePositionY={page.coverImagePositionY} coverImageCropX={page.coverImageCropX} coverImageCropY={page.coverImageCropY} coverImageCropWidth={page.coverImageCropWidth} coverImageCropHeight={page.coverImageCropHeight} brandColor={page.brandColor} allowThemeOverride={page.allowThemeOverride ?? true} themeMode={page.themeMode ?? "SYSTEM"} design={design} />
      <PageSurfaceLayout design={design} surface="access" renderBlock={renderBlock} />
      <PublicFooter removeBranding={page.removeBranding} termsUrl={page.termsUrl} privacyUrl={page.privacyUrl} supportUrl={page.supportUrl} design={design} />
    </PageDesignShell>
  );
}

import { notFound, redirect } from "next/navigation";
import { collections } from "@/lib/db";
import { toId } from "@/lib/mongo-utils";
import { checkPageAccess } from "@/lib/access";
import { AccessForm } from "@/components/public/AccessForm";
import type { CSSProperties } from "react";

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
  const pageDoc = await collections.pages().findOne({ slug });
  if (!pageDoc) notFound();
  const page = toId(pageDoc);
  if (page.type === "PUBLIC") redirect(returnTo);

  const access = await checkPageAccess(page);
  if (!access.ok && access.reason === "unavailable") notFound();
  if (access.ok) redirect(returnTo);

  return (
    <div
      className="status-theme min-h-screen flex items-center justify-center bg-[var(--bg)] p-4 text-[var(--fg)]"
      data-theme-preset={page.themePreset ?? "SIGNAL"}
      data-theme-mode={page.themeMode ?? "SYSTEM"}
      style={{ "--page-brand": page.brandColor } as CSSProperties}
    >
      <AccessForm slug={slug} type={page.type as "PRIVATE" | "AUDIENCE"} returnTo={returnTo} />
    </div>
  );
}

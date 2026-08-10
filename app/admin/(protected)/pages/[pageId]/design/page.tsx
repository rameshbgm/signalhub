import { redirect } from "next/navigation";

export default async function LegacyPageDesigner({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  redirect(`/organization/pages/${pageId}/appearance`);
}

import { notFound } from "next/navigation";
import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";

export default async function SetupLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ pageId: string }>;
}) {
  const { pageId } = await params;
  const { org } = await requireSession();
  const page = await collections.pages().findOne({ _id: oid(pageId) });
  if (!page || page.orgId.toHexString() !== org.id) notFound();

  return <div className="max-w-3xl mx-auto">{children}</div>;
}

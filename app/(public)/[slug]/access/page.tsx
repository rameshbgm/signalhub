import { notFound, redirect } from "next/navigation";
import { collections } from "@/lib/db";
import { toId } from "@/lib/mongo-utils";
import { checkPageAccess } from "@/lib/access";
import { AccessForm } from "@/components/public/AccessForm";

export default async function AccessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pageDoc = await collections.pages().findOne({ slug });
  if (!pageDoc) notFound();
  const page = toId(pageDoc);
  if (page.type === "PUBLIC") redirect(`/${slug}`);

  const access = await checkPageAccess(page);
  if (access.ok) redirect(`/${slug}`);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <AccessForm slug={slug} type={page.type as "PRIVATE" | "AUDIENCE"} />
    </div>
  );
}

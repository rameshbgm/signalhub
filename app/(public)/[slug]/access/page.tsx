import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { checkPageAccess } from "@/lib/access";
import { AccessForm } from "@/components/public/AccessForm";

export default async function AccessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await prisma.page.findUnique({ where: { slug } });
  if (!page) notFound();
  if (page.type === "PUBLIC") redirect(`/${slug}`);

  const access = await checkPageAccess(page);
  if (access.ok) redirect(`/${slug}`);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <AccessForm slug={slug} type={page.type as "PRIVATE" | "AUDIENCE"} />
    </div>
  );
}

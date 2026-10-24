import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { instanceBranding } from "@/lib/instance-branding";
import { WorkspaceWelcome } from "@/components/workspace/WorkspaceWelcome";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: `${instanceBranding().name} — Workspace`,
    description: "Sign in to your organization's workspace.",
    robots: { index: false, follow: false },
  };
}

export default async function Home() {
  if (await getSession()) redirect("/organization");
  return <WorkspaceWelcome {...instanceBranding()} />;
}

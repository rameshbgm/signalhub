"use server";

import { redirect } from "next/navigation";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { requireOrgSession, assertPageInOrg } from "@/lib/admin-guard";

export async function saveSetupBranding(pageId: string, formData: FormData) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);

  await collections.pages().updateOne(
    { _id: oid(pageId) },
    {
      $set: {
        logoUrl: String(formData.get("logoUrl") ?? "") || null,
        brandColor: String(formData.get("brandColor") ?? "#0052CC"),
        layout: String(formData.get("layout") ?? "STANDARD") === "COVER" ? "COVER" : "STANDARD",
      },
    }
  );

  redirect(`/admin/pages/${pageId}/setup/notifications`);
}

export async function completeSetup(pageId: string) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  redirect(`/admin/pages/${pageId}`);
}

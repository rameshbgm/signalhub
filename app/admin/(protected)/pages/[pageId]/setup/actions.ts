"use server";

import { redirect } from "next/navigation";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { requireCapability, assertPageInOrg } from "@/lib/admin-guard";
import { withTransaction } from "@/lib/cascade";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import {
  validatedBrandColor,
  validatedExternalUrl,
  validatedLayout,
} from "@/lib/page-validation";

export async function saveSetupBranding(pageId: string, formData: FormData) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);

  const rawLogoUrl = String(formData.get("logoUrl") ?? "").trim();
  const themePreset = String(formData.get("themePreset") ?? "SIGNAL");
  const themeMode = String(formData.get("themeMode") ?? "SYSTEM");
  if (!["SIGNAL", "CALM", "CONTRAST"].includes(themePreset)) throw new Error("Invalid theme preset");
  if (!["SYSTEM", "LIGHT", "DARK"].includes(themeMode)) throw new Error("Invalid theme mode");
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const page = await collections.pages().findOne(
      { _id: oid(pageId), orgId: oid(session.orgId) },
      { session: databaseSession }
    );
    if (!page) throw new Error("Page not found in your organization");
    const changed = await collections.pages().updateOne(
      { _id: page._id, orgId: page.orgId },
      {
        $set: {
          logoUrl: rawLogoUrl ? validatedExternalUrl(rawLogoUrl, { label: "Logo URL" }) : null,
          brandColor: validatedBrandColor(String(formData.get("brandColor") ?? "#0052CC")),
          layout: validatedLayout(String(formData.get("layout") ?? "STANDARD")),
          themePreset,
          themeMode: themeMode as "SYSTEM" | "LIGHT" | "DARK",
          allowThemeOverride: formData.get("allowThemeOverride") === "on",
        },
      },
      { session: databaseSession }
    );
    if (!changed.matchedCount) {
      throw new Error("Page changed while setup branding was being saved");
    }
  });

  redirect(`/admin/pages/${pageId}/setup/notifications`);
}

export async function completeSetup(pageId: string) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  redirect(`/admin/pages/${pageId}`);
}

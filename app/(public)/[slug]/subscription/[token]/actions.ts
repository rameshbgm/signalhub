"use server";

import { redirect } from "next/navigation";
import { unsubscribe, updateSubscriptionScope } from "@/lib/subscriptions";

function preferencesPath(slug: string, token: string, state: string) {
  return `/${encodeURIComponent(slug)}/subscription/${encodeURIComponent(token)}?${state}`;
}

/** Saves which services the subscriber follows. No selection means every service. */
export async function saveSubscriptionPreferences(slug: string, token: string, formData: FormData) {
  const scope = String(formData.get("scope") ?? "all");
  const componentIds = scope === "selected" ? formData.getAll("componentIds").map(String) : [];
  if (scope === "selected" && componentIds.length === 0) {
    redirect(preferencesPath(slug, token, "error=choose"));
  }
  const result = await updateSubscriptionScope(token, componentIds);
  redirect(preferencesPath(slug, token, result.ok ? "saved=1" : "error=save"));
}

export async function unsubscribeFromPage(slug: string, token: string) {
  const result = await unsubscribe(token);
  redirect(preferencesPath(slug, token, result.ok ? "unsubscribed=1" : "error=unsubscribe"));
}

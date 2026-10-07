import { redirect } from "next/navigation";

// Organization settings now live on the Organizations page in Platform administration.
export default function OrgSettingsPage() {
  redirect("/organization/platform/orgs#organization-settings");
}

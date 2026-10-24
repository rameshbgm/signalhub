import { redirect } from "next/navigation";

// Organizations are now the tenant directory on the Overview page; this keeps old links and bookmarks working.
export default function OrganizationsPage() {
  redirect("/organization/platform#organizations");
}

import { redirect } from "next/navigation";

export default function LegacyPlatformAdminsPage() {
  redirect("/organization/security");
}

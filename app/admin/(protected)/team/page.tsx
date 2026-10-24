import { redirect } from "next/navigation";

// Teams now live inside User management; this keeps old links and bookmarks working.
export default function TeamPage() {
  redirect("/organization/platform/users?tab=teams");
}

import Link from "next/link";
import { Landmark } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";

export default function RetiredPlatformInvitePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-wash p-6 text-ink">
      <Card className="w-full max-w-md animate-rise rounded-sheet shadow-raised">
        <CardContent className="p-8">
          <IconTile icon={Landmark} hue="violet" size="lg" />
          <p className="mt-5 text-sm font-medium text-ink-dim">Platform access</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Platform invitations have been retired</h1>
          <p className="mt-3 text-sm leading-6 text-ink-soft">
            Platform invitations have been retired. An Admin can create users directly from Users &amp; Roles.
          </p>
          <Link href="/login" className={buttonVariants({ className: "mt-6" })}>
            Platform sign in
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}

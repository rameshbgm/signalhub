import Link from "next/link";
import { SearchX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";

/** Keeps the console chrome when a page, event or other record does not exist or is outside this organization. */
export default function AdminNotFound() {
  return (
    <Card className="max-w-2xl">
      <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start">
        <IconTile icon={SearchX} hue="slate" size="lg" />
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink">Not found</h1>
          <p className="mt-1.5 text-sm leading-6 text-ink-soft">
            This item does not exist, was deleted, or belongs to another organization. Check the link or go back to the list.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/organization/pages" className={buttonVariants({ variant: "secondary", size: "sm" })}>Pages</Link>
            <Link href="/organization/events" className={buttonVariants({ variant: "ghost", size: "sm" })}>Events</Link>
            <Link href="/organization" className={buttonVariants({ variant: "ghost", size: "sm" })}>Dashboard</Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

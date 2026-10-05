import Link from "next/link";
import { Eye, EyeOff, Send } from "lucide-react";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { PageSubmitButton } from "@/components/admin/PageSubmitButton";
import { finishPageSetup, setPagePublicVisibility } from "@/app/admin/(protected)/pages/actions";
import { Button, buttonVariants } from "@/components/ui/button";

export type PageManagementActionPage = {
  id: string;
  setupCompleted: boolean;
  publicVisible: boolean;
  publicPath: string;
  canPublish: boolean;
};

export function PageManagementActions({ page }: { page: PageManagementActionPage }) {
  const publishing = !page.setupCompleted || !page.publicVisible;
  const action = !page.setupCompleted
    ? finishPageSetup.bind(null, page.id)
    : setPagePublicVisibility.bind(null, page.id, !page.publicVisible);
  const actionLabel = page.setupCompleted && page.publicVisible ? "Hide page" : "Publish page";
  const actionMessage = page.setupCompleted && page.publicVisible ? "Page hidden" : "Page published";
  const canPreview = page.setupCompleted && page.publicVisible;
  const hiding = !publishing;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canPreview ? (
        <Link href={page.publicPath} target="_blank" rel="noreferrer" aria-label="Preview public page" title="Preview public page" className={buttonVariants({ variant: "secondary" })}>
          <Eye aria-hidden="true" size={16} />
          Preview
        </Link>
      ) : (
        <Button type="button" variant="secondary" disabled aria-label="Preview unavailable until the page is published" title="Preview is available after publishing">
          <Eye aria-hidden="true" size={16} />
          Preview
        </Button>
      )}
      <PlatformActionForm
        action={action}
        successMessage={actionMessage}
        className="relative flex"
        messageClassName="absolute right-0 top-full z-10 mt-2 w-max max-w-64 rounded-control bg-surface ring-1 ring-line px-3 py-1.5 font-medium shadow-raised empty:border-0 empty:p-0 empty:shadow-none"
      >
        <PageSubmitButton
          variant={hiding ? "outline" : "default"}
          title={actionLabel}
          disabled={!page.setupCompleted && !page.canPublish}
          pendingLabel={publishing ? "Publishing…" : "Updating…"}
        >
          {hiding ? <EyeOff aria-hidden="true" size={16} /> : <Send aria-hidden="true" size={16} />}
          {actionLabel}
        </PageSubmitButton>
      </PlatformActionForm>
    </div>
  );
}

import Link from "next/link";
import { Eye, EyeOff, Send } from "lucide-react";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { PlatformSubmitButton } from "@/components/platform/PlatformSubmitButton";
import { finishPageSetup, setPagePublicVisibility } from "@/app/admin/(protected)/pages/actions";

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

  return (
    <div className="flex shrink-0 items-center gap-2 pb-2 md:pb-1">
      {canPreview ? <Link href={page.publicPath} target="_blank" rel="noreferrer" aria-label="Preview public page" title="Preview public page" className="page-management-action-icon rounded-lg border border-[var(--line-bright)] bg-[var(--surface)] text-[var(--cyan)] hover:bg-[var(--cyan-soft)]"><Eye aria-hidden="true" size={17} /></Link> : <button type="button" disabled aria-label="Preview unavailable until the page is published" title="Preview is available after publishing" className="page-management-action-icon cursor-not-allowed rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--fg-dim)] opacity-70"><Eye aria-hidden="true" size={17} /></button>}
      <PlatformActionForm action={action} successMessage={actionMessage} className="relative flex" messageClassName="absolute right-0 top-full z-10 mt-2 whitespace-nowrap">
        <PlatformSubmitButton aria-label={actionLabel} title={actionLabel} disabled={!page.setupCompleted && !page.canPublish} pendingLabel={publishing ? "Publishing…" : "Updating…"} className="page-management-action-icon rounded-lg bg-[var(--cyan)] text-[var(--on-cyan)]"><span aria-hidden="true">{page.setupCompleted && page.publicVisible ? <EyeOff size={17} /> : <Send size={17} />}</span><span className="sr-only">{actionLabel}</span></PlatformSubmitButton>
      </PlatformActionForm>
    </div>
  );
}

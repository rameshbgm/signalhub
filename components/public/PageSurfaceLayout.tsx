import type { ReactNode } from "react";
import type { PageDesignBlock, PageSurfaceKey, StatusPageDesign } from "@/lib/page-design";
import { contentWidthClass } from "@/components/public/PageDesignShell";

export function PageSurfaceLayout({
  design,
  surface,
  intro,
  renderBlock,
}: {
  design: StatusPageDesign;
  surface: PageSurfaceKey;
  intro?: ReactNode;
  renderBlock: (block: PageDesignBlock) => ReactNode;
}) {
  const configuration = design.surfaces[surface];
  const visibleSidebar = configuration.sidebar.some((block) => !block.hidden);
  return (
    <main className={`${contentWidthClass(design)} mx-auto w-full flex-1 px-4 py-8 sm:py-12`}>
      {intro}
      <div className="space-y-[var(--page-block-gap)]">
        {configuration.full.map((block) => (
          <div key={block.id} data-page-block={block.type}>{block.hidden ? null : renderBlock(block)}</div>
        ))}
      </div>
      {(configuration.primary.length > 0 || configuration.sidebar.length > 0) && (
        <div className={`mt-[var(--page-block-gap)] grid gap-[var(--page-block-gap)] ${visibleSidebar ? "lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]" : ""}`}>
          <div className="space-y-[var(--page-block-gap)]">
            {configuration.primary.map((block) => <div key={block.id} data-page-block={block.type}>{block.hidden ? null : renderBlock(block)}</div>)}
          </div>
          <aside className="space-y-[var(--page-block-gap)]">
            {configuration.sidebar.map((block) => <div key={block.id} data-page-block={block.type}>{block.hidden ? null : renderBlock(block)}</div>)}
          </aside>
        </div>
      )}
    </main>
  );
}

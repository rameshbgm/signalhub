import type { CSSProperties, ReactNode } from "react";
import type { PageDesignBlock, PageSurfaceKey, StatusPageDesign } from "@/lib/page-design";
import { allSurfaceBlocks, pageGridPlacements } from "@/lib/page-design";
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
  const blocks = allSurfaceBlocks(design, surface);
  // These content-led layouts keep the optional subscription action after the
  // operational content instead of competing with incident history.
  const subscriptionAfterContent = new Set(["GROUPED_DIRECTORY", "ILLUSTRATED_HERO"]);
  const trailingSubscriptions = subscriptionAfterContent.has(design.templateKey)
    ? blocks.filter((block) => block.type === "SUBSCRIBE" && block.settings.style === "PANEL")
    : [];
  const trailingSubscriptionIds = new Set(trailingSubscriptions.map((block) => block.id));
  const gridBlocks = blocks.filter((block) => !trailingSubscriptionIds.has(block.id));
  const desktop = new Map(pageGridPlacements(design, surface, "desktop").map((placement) => [placement.blockId, placement]));
  const tablet = new Map(pageGridPlacements(design, surface, "tablet").map((placement) => [placement.blockId, placement]));
  const mobile = new Map(pageGridPlacements(design, surface, "mobile").map((placement) => [placement.blockId, placement]));
  return (
    <main className={`${contentWidthClass(design)} mx-auto w-full flex-1 px-4 py-8 sm:py-12`}>
      {intro}
      <div className="page-responsive-grid">
        {gridBlocks.map((block) => {
          const desktopPlacement = desktop.get(block.id);
          const tabletPlacement = tablet.get(block.id);
          const mobilePlacement = mobile.get(block.id);
          if (!desktopPlacement || !tabletPlacement || !mobilePlacement) return null;
          const style = {
            "--grid-desktop-column": `${desktopPlacement.column} / span ${desktopPlacement.span}`,
            "--grid-desktop-order": desktopPlacement.order,
            "--grid-tablet-column": `${tabletPlacement.column} / span ${tabletPlacement.span}`,
            "--grid-tablet-order": tabletPlacement.order,
            "--grid-mobile-column": `${mobilePlacement.column} / span ${mobilePlacement.span}`,
            "--grid-mobile-order": mobilePlacement.order,
          } as CSSProperties;
          return (
            <div key={block.id} data-page-block={block.type} className="page-responsive-grid-item" style={style}>
              {block.hidden ? null : renderBlock(block)}
            </div>
          );
        })}
      </div>
      {trailingSubscriptions.map((block) => (
        <aside key={block.id} data-page-block={block.type} className="mx-auto mt-[var(--page-block-gap)] w-full max-w-2xl">
          {block.hidden ? null : renderBlock(block)}
        </aside>
      ))}
    </main>
  );
}

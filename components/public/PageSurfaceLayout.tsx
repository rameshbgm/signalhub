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
  const desktop = new Map(pageGridPlacements(design, surface, "desktop").map((placement) => [placement.blockId, placement]));
  const tablet = new Map(pageGridPlacements(design, surface, "tablet").map((placement) => [placement.blockId, placement]));
  const mobile = new Map(pageGridPlacements(design, surface, "mobile").map((placement) => [placement.blockId, placement]));
  return (
    <main className={`${contentWidthClass(design)} mx-auto w-full flex-1 px-4 py-8 sm:py-12`}>
      {intro}
      <div className="page-responsive-grid">
        {blocks.map((block) => {
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
    </main>
  );
}

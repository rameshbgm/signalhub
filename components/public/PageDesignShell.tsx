import type { CSSProperties, ReactNode } from "react";
import type { StatusPageDesign } from "@/lib/page-design";

export function PageDesignShell({
  pageId,
  publishedVersion,
  design,
  customCss,
  language,
  children,
}: {
  pageId: string;
  publishedVersion?: number;
  design: StatusPageDesign;
  customCss?: string | null;
  language: string;
  children: ReactNode;
}) {
  const { palette, darkPalette } = design.theme;
  const style = {
    "--design-bg": palette.background,
    "--design-surface": palette.surface,
    "--design-fg": palette.text,
    "--design-fg-soft": palette.mutedText,
    "--design-dark-bg": darkPalette.background,
    "--design-dark-surface": darkPalette.surface,
    "--design-dark-fg": darkPalette.text,
    "--design-dark-fg-soft": darkPalette.mutedText,
    "--page-brand": palette.brand,
    "--page-accent": palette.accent,
  } as CSSProperties;

  return (
    <div
      className="status-theme min-h-screen flex flex-col bg-[var(--bg)] text-[var(--fg)]"
      data-status-page={pageId}
      data-published-version={publishedVersion}
      data-template={design.templateKey}
      data-theme-mode={design.theme.mode}
      data-density={design.theme.density}
      data-content-width={design.theme.contentWidth}
      data-radius={design.theme.radius}
      data-shadow={design.theme.shadow}
      data-typography={design.theme.typography}
      lang={language}
      style={style}
    >
      {customCss && <style>{customCss}</style>}
      {children}
    </div>
  );
}

export function contentWidthClass(design: StatusPageDesign) {
  if (design.theme.contentWidth === "NARROW") return "max-w-3xl";
  if (design.theme.contentWidth === "WIDE") return "max-w-7xl";
  return "max-w-5xl";
}

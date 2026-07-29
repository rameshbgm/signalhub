import Link from "next/link";
import Image from "next/image";
import { ThemeToggle } from "@/components/ThemeToggle";
import { safeUrl } from "@/lib/url";
import type { ReactNode } from "react";
import type { StatusPageDesign } from "@/lib/page-design";
import { contentWidthClass } from "@/components/public/PageDesignShell";
import { coverImageStyle, type CoverImageFit } from "@/lib/cover-image";

export function PublicHeader({
  name,
  logoUrl,
  hubSlug,
  layout = "STANDARD",
  coverImageUrl,
  coverImageFit,
  coverImagePositionX,
  coverImagePositionY,
  coverImageCropX,
  coverImageCropY,
  coverImageCropWidth,
  coverImageCropHeight,
  brandColor,
  allowThemeOverride = true,
  themeMode = "SYSTEM",
  design,
  subscribeSlot,
}: {
  name: string;
  logoUrl?: string | null;
  supportUrl?: string | null;
  hubSlug?: string | null;
  layout?: string;
  coverImageUrl?: string | null;
  coverImageFit?: CoverImageFit | null;
  coverImagePositionX?: number | null;
  coverImagePositionY?: number | null;
  coverImageCropX?: number | null;
  coverImageCropY?: number | null;
  coverImageCropWidth?: number | null;
  coverImageCropHeight?: number | null;
  brandColor?: string;
  allowThemeOverride?: boolean;
  themeMode?: string;
  design?: StatusPageDesign;
  subscribeSlot?: ReactNode;
}) {
  const header = design?.chrome.header;
  const effectiveThemeMode = design?.theme.mode ?? themeMode;
  const effectiveThemeOverride = design?.theme.allowVisitorMode ?? allowThemeOverride;
  const headerVariant = header?.variant ?? (layout === "COVER" ? "HERO" : layout === "MINIMAL" ? "MINIMAL" : "STANDARD");
  const visibleItems = header?.items.filter((item) => !item.hidden) ?? standardHeaderItems();
  const showCompleteCover = Boolean(coverImageUrl && coverImageFit !== "COVER");
  const coverBanner = coverImageUrl ? (
    showCompleteCover ? (
      <div className="relative aspect-[16/5] overflow-hidden border-b border-[var(--line)] bg-[var(--surface-raised)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={coverImageUrl} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-105 object-cover opacity-25 blur-lg" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverImageUrl}
          alt={`${name} cover image`}
          className="relative h-full w-full object-contain"
        />
      </div>
    ) : (
      <div
        role="img"
        aria-label={`${name} cover image`}
        className="h-36 border-b border-[var(--line)] bg-[var(--surface-raised)] sm:h-52"
        style={coverImageStyle(coverImageUrl, {
          fit: coverImageFit,
          positionX: coverImagePositionX,
          positionY: coverImagePositionY,
          cropX: coverImageCropX,
          cropY: coverImageCropY,
          cropWidth: coverImageCropWidth,
          cropHeight: coverImageCropHeight,
        })}
      />
    )
  ) : null;
  const nav = (
    <div className={`flex flex-1 items-center gap-4 text-sm font-medium ${headerVariant === "CENTERED" ? "justify-center text-center flex-wrap" : ""}`}>
      {visibleItems.map((item) => {
        if (item.type === "LOGO") {
          return logoUrl ? (
            <Image key={item.id} unoptimized src={logoUrl} alt={name} width={160} height={40} className="max-h-10 w-auto max-w-44 object-contain object-left" />
          ) : null;
        }
        if (item.type === "TITLE") return <span key={item.id} className="font-mono font-semibold text-lg text-[var(--fg)]">{name}</span>;
        if (item.type === "HUB_LINK" && hubSlug) return <Link key={item.id} href={`/hub/${hubSlug}`} className="hover:opacity-80">All Products</Link>;
        if (item.type === "NAVIGATION") {
          return (
            <span key={item.id} className="contents">
              {(header?.links ?? []).map((link) => <a key={link.url} href={link.url} className="hover:opacity-80">{link.label}</a>)}
            </span>
          );
        }
        if (item.type === "SUBSCRIBE" && subscribeSlot) return <span key={item.id}>{subscribeSlot}</span>;
        if (item.type === "THEME_TOGGLE" && effectiveThemeOverride && effectiveThemeMode === "SYSTEM") return <span key={item.id}><ThemeToggle /></span>;
        return null;
      })}
    </div>
  );

  if (headerVariant === "MINIMAL") {
    return (
      <>
        <header className="border-b-2 bg-[var(--surface)]" style={{ borderColor: design?.theme.palette.brand ?? brandColor ?? "var(--cyan)" }}>
          <div className={`${design ? contentWidthClass(design) : "max-w-4xl"} mx-auto px-4 sm:px-6 py-3 flex items-center gap-4 text-[var(--fg-soft)]`}>
            {nav}
          </div>
        </header>
        {coverBanner}
      </>
    );
  }

  if (headerVariant === "HERO") {
    if (coverImageUrl && showCompleteCover) {
      return (
        <header className="relative overflow-hidden border-b border-[var(--line)] bg-[var(--bg)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverImageUrl} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-105 object-cover opacity-25 blur-lg" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverImageUrl} alt={`${name} cover image`} className="relative aspect-[16/5] h-auto w-full object-contain" />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 to-slate-950/80" aria-hidden="true" />
          <div className="absolute inset-0 flex items-center">
            <div className={`${design ? contentWidthClass(design) : "max-w-4xl"} mx-auto w-full px-4 sm:px-6`}>
              <div className="flex items-center gap-5 text-white flex-wrap">{nav}</div>
            </div>
          </div>
        </header>
      );
    }

    return (
      <header
        className="relative grain overflow-hidden border-b border-[var(--line)] bg-[var(--bg)]"
        style={coverImageUrl ? coverImageStyle(
          coverImageUrl,
          {
            fit: coverImageFit,
            positionX: coverImagePositionX,
            positionY: coverImagePositionY,
            cropX: coverImageCropX,
            cropY: coverImageCropY,
            cropWidth: coverImageCropWidth,
            cropHeight: coverImageCropHeight,
          },
          "linear-gradient(rgba(10,14,20,0.7),rgba(10,14,20,0.85))"
        ) : {}}
      >
        <div className={`relative ${design ? contentWidthClass(design) : "max-w-4xl"} mx-auto px-4 sm:px-6 py-12 sm:py-20`}>
          <div className="flex items-center gap-5 text-[var(--fg-soft)] flex-wrap">{nav}</div>
        </div>
      </header>
    );
  }

  if (headerVariant === "CENTERED") {
    return (
      <>
        <header className={`border-b border-[var(--line)] bg-[var(--surface)] ${header?.sticky ? "sticky top-0 z-30" : ""}`}>
          <div className={`${design ? contentWidthClass(design) : "max-w-4xl"} mx-auto flex items-center justify-center px-4 py-7 text-[var(--fg-soft)] sm:px-6`}>
            {nav}
          </div>
        </header>
        {coverBanner}
      </>
    );
  }

  return (
    <>
      <header className={`border-b border-[var(--line)] bg-[var(--surface)]/90 backdrop-blur-sm z-30 ${header?.sticky ? "sticky top-0" : ""}`}>
        <div className={`${design ? contentWidthClass(design) : "max-w-4xl"} mx-auto px-4 sm:px-6 py-4 flex items-center gap-5 text-[var(--fg-soft)]`}>
          {nav}
        </div>
      </header>
      {coverBanner}
    </>
  );
}

export function PublicFooter({
  removeBranding,
  termsUrl,
  privacyUrl,
  supportUrl,
  design,
}: {
  removeBranding: boolean;
  termsUrl?: string | null;
  privacyUrl?: string | null;
  supportUrl?: string | null;
  design?: StatusPageDesign;
}) {
  const safeTermsUrl = safeUrl(termsUrl);
  const safePrivacyUrl = safeUrl(privacyUrl);
  const safeSupportUrl = safeUrl(supportUrl);
  return (
    <footer className="border-t border-[var(--line)] mt-16 py-8 text-sm text-[var(--fg-dim)]">
      <div className={`${design ? contentWidthClass(design) : "max-w-4xl"} mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-5`}>
        {design?.chrome.footer.items.filter((item) => !item.hidden).map((item) => {
          if (item.type === "CUSTOM_TEXT" && design.chrome.footer.customText) return <span key={item.id}>{design.chrome.footer.customText}</span>;
          if (item.type === "LINKS") return <span key={item.id} className="flex gap-5">{design.chrome.footer.links.map((link) => <a key={link.url} href={link.url} className="hover:text-[var(--fg-soft)]">{link.label}</a>)}</span>;
          if (item.type === "LEGAL" && (safeTermsUrl || safePrivacyUrl || safeSupportUrl)) return (
            <span key={item.id} className="flex gap-5">
              {safeSupportUrl && (
                <a href={safeSupportUrl} className="hover:text-[var(--fg-soft)] transition-colors">
                  Support
                </a>
              )}
              {safeTermsUrl && (
            <a href={safeTermsUrl} className="hover:text-[var(--fg-soft)] transition-colors">
              Terms of Service
            </a>
          )}
          {safePrivacyUrl && (
            <a href={safePrivacyUrl} className="hover:text-[var(--fg-soft)] transition-colors">
              Privacy Policy
            </a>
          )}
            </span>
          );
          if (item.type === "BRANDING" && !removeBranding) return <span key={item.id} className="font-mono">Powered by SignalHub</span>;
          if (item.type === "COPYRIGHT") return <span key={item.id}>© {new Date().getFullYear()}</span>;
          return null;
        }) ?? (
          <div className="font-mono">{!removeBranding && <span>Powered by SignalHub</span>}<span className="ml-3">© {new Date().getFullYear()}</span></div>
        )}
      </div>
    </footer>
  );
}

function standardHeaderItems() {
  return [
    { id: "legacy-logo", type: "LOGO" as const, hidden: false },
    { id: "legacy-title", type: "TITLE" as const, hidden: false },
    { id: "legacy-hub", type: "HUB_LINK" as const, hidden: false },
    { id: "legacy-theme", type: "THEME_TOGGLE" as const, hidden: false },
  ];
}

import Link from "next/link";
import Image from "next/image";
import { ThemeToggle } from "@/components/ThemeToggle";
import { safeUrl } from "@/lib/url";

export function PublicHeader({
  name,
  logoUrl,
  supportUrl,
  hubSlug,
  layout = "STANDARD",
  coverImageUrl,
  brandColor,
  allowThemeOverride = true,
  themeMode = "SYSTEM",
}: {
  name: string;
  logoUrl?: string | null;
  supportUrl?: string | null;
  hubSlug?: string | null;
  layout?: string;
  coverImageUrl?: string | null;
  brandColor?: string;
  allowThemeOverride?: boolean;
  themeMode?: string;
}) {
  const safeSupportUrl = safeUrl(supportUrl);
  const nav = (
    <div className="flex items-center gap-5 text-sm font-medium">
      {hubSlug && (
        <Link href={`/hub/${hubSlug}`} className="hover:opacity-80 transition-opacity">
          All Products
        </Link>
      )}
      {safeSupportUrl && (
        <a href={safeSupportUrl} className="hover:opacity-80 transition-opacity">
          Support
        </a>
      )}
      {allowThemeOverride && themeMode === "SYSTEM" && <ThemeToggle />}
    </div>
  );

  if (layout === "MINIMAL") {
    return (
      <header className="border-b-2 bg-[var(--surface)]" style={{ borderColor: brandColor ?? "var(--cyan)" }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            {logoUrl ? (
              <Image unoptimized src={logoUrl} alt={name} width={160} height={32} style={{ width: "auto", height: "auto" }} className="h-8 max-h-8 max-w-40 object-contain object-left" />
            ) : null}
            <span className="font-mono font-semibold text-sm tracking-tight text-[var(--fg)]">{name}</span>
          </div>
          <div className="text-[var(--fg-soft)]">{nav}</div>
        </div>
      </header>
    );
  }

  if (layout === "COVER") {
    return (
      <header
        className="relative grain overflow-hidden bg-[var(--bg)] bg-cover bg-center border-b border-[var(--line)]"
        style={coverImageUrl ? { backgroundImage: `linear-gradient(rgba(10,14,20,0.7),rgba(10,14,20,0.85)), url(${coverImageUrl})` } : {}}
      >
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
          <div className="flex items-center justify-between text-[var(--fg-soft)] flex-wrap gap-3">
            <span className="text-xs uppercase tracking-widest font-mono font-medium">Official SignalHub</span>
            {nav}
          </div>
          <div className="mt-8 flex items-center gap-4">
            {logoUrl ? (
              <span className="flex h-16 min-w-16 max-w-56 items-center justify-center border border-[var(--line-bright)] bg-[var(--surface)]/70 p-2">
                <Image unoptimized src={logoUrl} alt={name} width={208} height={48} style={{ width: "auto", height: "auto" }} className="max-h-12 max-w-52 object-contain" />
              </span>
            ) : (
              <div
                className="h-14 w-14 border border-[var(--line-bright)] flex items-center justify-center text-xl font-semibold font-mono text-[var(--fg)]"
                style={{ backgroundColor: brandColor ?? "var(--surface-raised)" }}
              >
                {name.slice(0, 1)}
              </div>
            )}
            <span className="font-mono font-semibold text-3xl text-[var(--fg)] tracking-tight">{name}</span>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="border-b border-[var(--line)] bg-[var(--surface)]/90 backdrop-blur-sm sticky top-0 z-30">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <span className="flex h-11 min-w-11 max-w-48 items-center justify-center border border-[var(--line)] bg-[var(--bg)] p-1.5">
              <Image unoptimized src={logoUrl} alt={name} width={176} height={32} style={{ width: "auto", height: "auto" }} className="max-h-8 max-w-44 object-contain" />
            </span>
          ) : (
            <div className="h-9 w-9 bg-[var(--surface-raised)] border border-[var(--line)] flex items-center justify-center text-xs font-semibold font-mono text-[var(--fg)]">
              {name.slice(0, 1)}
            </div>
          )}
          <span className="font-mono font-semibold text-lg tracking-tight text-[var(--fg)]">{name}</span>
        </div>
        <div className="text-[var(--fg-soft)]">{nav}</div>
      </div>
    </header>
  );
}

export function PublicFooter({
  removeBranding,
  termsUrl,
  privacyUrl,
}: {
  removeBranding: boolean;
  termsUrl?: string | null;
  privacyUrl?: string | null;
}) {
  const safeTermsUrl = safeUrl(termsUrl);
  const safePrivacyUrl = safeUrl(privacyUrl);
  return (
    <footer className="border-t border-[var(--line)] mt-16 py-8 text-sm text-[var(--fg-dim)]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row justify-between gap-3">
        <div className="flex gap-5">
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
        </div>
        <div className="font-mono">
          {!removeBranding && <span>Powered by SignalHub</span>}
          <span className="ml-3">© {new Date().getFullYear()}</span>
        </div>
      </div>
    </footer>
  );
}

import Link from "next/link";

export function PublicHeader({
  name,
  logoUrl,
  supportUrl,
  hubSlug,
  layout = "STANDARD",
  coverImageUrl,
  brandColor,
}: {
  name: string;
  logoUrl?: string | null;
  supportUrl?: string | null;
  hubSlug?: string | null;
  layout?: string;
  coverImageUrl?: string | null;
  brandColor?: string;
}) {
  const nav = (
    <div className="flex items-center gap-5 text-sm font-medium">
      {hubSlug && (
        <Link href={`/hub/${hubSlug}`} className="hover:opacity-80 transition-opacity">
          All Products
        </Link>
      )}
      {supportUrl && (
        <a href={supportUrl} className="hover:opacity-80 transition-opacity">
          Support
        </a>
      )}
    </div>
  );

  if (layout === "COVER") {
    return (
      <header
        className="relative bg-gray-900 bg-cover bg-center"
        style={coverImageUrl ? { backgroundImage: `linear-gradient(rgba(10,10,12,0.6),rgba(10,10,12,0.8)), url(${coverImageUrl})` } : { backgroundColor: brandColor ?? "#111827" }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
          <div className="flex items-center justify-between text-white/70">
            <span className="text-xs uppercase tracking-widest font-medium">Official Status</span>
            {nav}
          </div>
          <div className="mt-8 flex items-center gap-4">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={name} className="h-14 w-14 rounded-xl bg-white/10 object-cover ring-1 ring-white/20" />
            ) : (
              <div className="h-14 w-14 rounded-xl bg-white/10 ring-1 ring-white/20 flex items-center justify-center text-xl font-semibold text-white font-display">
                {name.slice(0, 1)}
              </div>
            )}
            <span className="font-display font-semibold text-3xl text-white tracking-tight">{name}</span>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={name} className="h-9 w-9 rounded-lg object-cover ring-1 ring-gray-200" />
          ) : (
            <div className="h-9 w-9 rounded-lg bg-gray-900 flex items-center justify-center text-xs font-semibold text-white font-display">
              {name.slice(0, 1)}
            </div>
          )}
          <span className="font-display font-semibold text-lg tracking-tight text-gray-900">{name}</span>
        </div>
        <div className="text-gray-500">{nav}</div>
      </div>
    </header>
  );
}

export function PublicFooter({ removeBranding }: { removeBranding: boolean }) {
  return (
    <footer className="border-t border-gray-200 mt-16 py-8 text-sm text-gray-400">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row justify-between gap-3">
        <div className="flex gap-5">
          <a href="#" className="hover:text-gray-600 transition-colors">
            Terms of Service
          </a>
          <a href="#" className="hover:text-gray-600 transition-colors">
            Privacy Policy
          </a>
        </div>
        <div>
          {!removeBranding && <span>Powered by Statuspage Platform</span>}
          <span className="ml-3">© {new Date().getFullYear()}</span>
        </div>
      </div>
    </footer>
  );
}

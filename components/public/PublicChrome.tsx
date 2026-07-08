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
    <div className="flex items-center gap-4 text-sm">
      {hubSlug && (
        <Link href={`/hub/${hubSlug}`} className="hover:opacity-80">
          All Products
        </Link>
      )}
      {supportUrl && (
        <a href={supportUrl} className="hover:opacity-80">
          Support
        </a>
      )}
    </div>
  );

  if (layout === "COVER") {
    return (
      <header
        className="relative bg-gray-900 bg-cover bg-center"
        style={coverImageUrl ? { backgroundImage: `linear-gradient(rgba(10,10,12,0.55),rgba(10,10,12,0.75)), url(${coverImageUrl})` } : { backgroundColor: brandColor ?? "#111827" }}
      >
        <div className="max-w-4xl mx-auto px-4 py-10 sm:py-16">
          <div className="flex items-center justify-between text-white/70">
            <span className="text-xs uppercase tracking-widest">Official Status</span>
            {nav}
          </div>
          <div className="mt-6 flex items-center gap-4">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={name} className="h-12 w-12 rounded-lg bg-white/10" />
            ) : (
              <div className="h-12 w-12 rounded-lg bg-white/10 flex items-center justify-center text-lg font-bold text-white">
                {name.slice(0, 1)}
              </div>
            )}
            <span className="font-semibold text-2xl text-white">{name}</span>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="border-b bg-white">
      <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={name} className="h-8 w-8 rounded" />
          ) : (
            <div className="h-8 w-8 rounded bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500">
              {name.slice(0, 1)}
            </div>
          )}
          <span className="font-semibold text-lg">{name}</span>
        </div>
        <div className="text-gray-500">{nav}</div>
      </div>
    </header>
  );
}

export function PublicFooter({ removeBranding }: { removeBranding: boolean }) {
  return (
    <footer className="border-t mt-12 py-8 text-sm text-gray-400">
      <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row justify-between gap-2">
        <div className="flex gap-4">
          <a href="#" className="hover:text-gray-600">
            Terms of Service
          </a>
          <a href="#" className="hover:text-gray-600">
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

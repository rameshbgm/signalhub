import Link from "next/link";

export function PublicHeader({
  name,
  logoUrl,
  supportUrl,
  hubSlug,
}: {
  name: string;
  logoUrl?: string | null;
  supportUrl?: string | null;
  hubSlug?: string | null;
}) {
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
        <div className="flex items-center gap-4 text-sm text-gray-500">
          {hubSlug && (
            <Link href={`/hub/${hubSlug}`} className="hover:text-gray-800">
              All Products
            </Link>
          )}
          {supportUrl && (
            <a href={supportUrl} className="hover:text-gray-800">
              Support
            </a>
          )}
        </div>
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

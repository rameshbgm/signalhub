export function StatusBanner({ label, color }: { label: string; color: string }) {
  return (
    <div
      className="rounded-xl px-6 py-6 flex items-center gap-4 text-white font-display font-semibold text-xl shadow-sm ring-1 ring-black/5"
      style={{ backgroundColor: color }}
    >
      <BannerIcon />
      {label}
    </div>
  );
}

function BannerIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <circle cx="12" cy="12" r="11" fill="white" fillOpacity="0.22" />
      <path d="M7 12.5l3 3 7-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

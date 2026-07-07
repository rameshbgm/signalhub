export function StatusBanner({ label, color }: { label: string; color: string }) {
  return (
    <div
      className="rounded-lg px-6 py-5 flex items-center gap-3 text-white font-medium text-lg shadow-sm"
      style={{ backgroundColor: color }}
    >
      <BannerIcon color={color} />
      {label}
    </div>
  );
}

function BannerIcon({ color }: { color: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <circle cx="12" cy="12" r="11" fill="white" fillOpacity="0.25" />
      <path d="M7 12.5l3 3 7-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

"use client";

import { useEffect, useState } from "react";

export type PublicAnnouncement = {
  id: string;
  title: string;
  body: string;
  severity: "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";
  ctaLabel: string | null;
  ctaUrl: string | null;
  dismissible: boolean;
};

const appearance = {
  INFO: { border: "var(--status-maintenance)", background: "color-mix(in srgb, var(--status-maintenance) 10%, var(--surface))" },
  SUCCESS: { border: "var(--status-operational)", background: "color-mix(in srgb, var(--status-operational) 10%, var(--surface))" },
  WARNING: { border: "var(--status-degraded)", background: "color-mix(in srgb, var(--status-degraded) 10%, var(--surface))" },
  CRITICAL: { border: "var(--status-major)", background: "color-mix(in srgb, var(--status-major) 10%, var(--surface))" },
};

export function AnnouncementList({
  pageId,
  announcements,
  maxItems = 3,
}: {
  pageId: string;
  announcements: PublicAnnouncement[];
  maxItems?: number;
}) {
  const storageKey = `signalhub-dismissed-announcements:${pageId}`;
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setDismissed(JSON.parse(localStorage.getItem(storageKey) ?? "[]"));
      } catch {
        setDismissed([]);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  const visible = announcements.filter((announcement) => !dismissed.includes(announcement.id)).slice(0, maxItems);
  if (!visible.length) return null;
  function dismiss(id: string) {
    const next = [...new Set([...dismissed, id])];
    setDismissed(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }

  return (
    <div className="space-y-3">
      {visible.map((announcement) => (
        <aside
          key={announcement.id}
          className="page-panel border px-5 py-4"
          style={{ borderColor: appearance[announcement.severity].border, background: appearance[announcement.severity].background }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-[var(--fg)]">{announcement.title}</h2>
              {announcement.body && <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--fg-soft)]">{announcement.body}</p>}
              {announcement.ctaUrl && announcement.ctaLabel && (
                <a href={announcement.ctaUrl} className="mt-2 inline-block text-sm font-medium underline" style={{ color: appearance[announcement.severity].border }}>
                  {announcement.ctaLabel}
                </a>
              )}
            </div>
            {announcement.dismissible && (
              <button type="button" onClick={() => dismiss(announcement.id)} className="text-xl leading-none text-[var(--fg-dim)]" aria-label={`Dismiss ${announcement.title}`}>
                ×
              </button>
            )}
          </div>
        </aside>
      ))}
    </div>
  );
}

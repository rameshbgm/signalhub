import type { Metadata } from "next";

export function publicFaviconMetadata(faviconUrl?: string | null): Metadata {
  if (!faviconUrl) return {};
  return {
    icons: {
      icon: [{ url: faviconUrl }],
      shortcut: [faviconUrl],
    },
  };
}

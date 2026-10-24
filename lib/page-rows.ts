import { publicPagePath } from "@/lib/public-path";
import type { PageRow } from "@/components/admin/page-group";

type MemberPage = { id: string; name: string; slug: string; brandColor: string | null; type: string; setupCompletedAt: Date | null; publicVisible: boolean | null };

/** Row for a hub member without event info (hub overview and content tabs). */
export function memberRow(page: MemberPage): PageRow {
  const setupDone = page.setupCompletedAt !== null;
  const visible = page.publicVisible !== false;
  const state = !setupDone ? "Draft" : visible ? "Published" : "Hidden";
  return {
    id: page.id,
    name: page.name,
    slug: page.slug,
    brand: page.brandColor || "var(--color-primary)",
    state,
    tone: state === "Published" ? "ok" : state === "Hidden" ? "neutral" : "warn",
    type: page.type,
    event: null,
    visible,
    setupDone,
    liveHref: setupDone && visible ? publicPagePath(page) : null,
    setupHref: setupDone ? null : `/organization/pages/${page.id}`,
  };
}

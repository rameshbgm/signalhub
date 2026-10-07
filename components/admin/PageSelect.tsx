"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";

/** Picks a page by navigating to `basePath?pageId=…`; with `allLabel`, an extra first option clears the filter. */
export function PageSelect({ pages, basePath, selected, allLabel }: { pages: { id: string; name: string }[]; basePath: string; selected?: string; allLabel?: string }) {
  const router = useRouter();
  return (
    <Select
      aria-label="Status page"
      defaultValue={selected ?? ""}
      onChange={(e) => router.push(e.target.value ? `${basePath}?pageId=${e.target.value}` : basePath)}
      className="w-full"
    >
      {allLabel && <option value="">{allLabel}</option>}
      {pages.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </Select>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";

/** Picks a page by adding `pageId=…` to `basePath` (which may carry its own query); with `allLabel`, an extra first option clears the filter. */
export function PageSelect({ pages, basePath, selected, allLabel, onPick }: { pages: { id: string; name: string }[]; basePath: string; selected?: string; allLabel?: string; /** Called with the chosen page id as the navigation starts. */ onPick?: (id: string) => void }) {
  const router = useRouter();
  return (
    <Select
      aria-label="Status page"
      defaultValue={selected ?? ""}
      onChange={(e) => {
        const id = e.target.value;
        onPick?.(id);
        router.push(id ? `${basePath}${basePath.includes("?") ? "&" : "?"}pageId=${id}` : basePath);
      }}
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

"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Select } from "@/components/ui/select";
import { usePageSelection } from "@/components/admin/PageSelectionProvider";
import { pagePickerHref } from "@/lib/page-selection";

/** Picks a page by adding `pageId=…` to `basePath` (which may carry its own query); with `allLabel`, an extra first option clears the filter. */
export function PageSelect({ pages, basePath, selected, allLabel, onPick }: { pages: { id: string; name: string }[]; basePath: string; selected?: string; allLabel?: string; /** Called with the chosen page id as the navigation starts. */ onPick?: (id: string) => void }) {
  const router = useRouter();
  const { rememberPage } = usePageSelection();
  useEffect(() => { if (selected) rememberPage(selected); }, [selected, rememberPage]);
  return (
    <Select
      key={selected ?? "all"}
      aria-label="Status page"
      defaultValue={selected ?? ""}
      onChange={(e) => {
        const id = e.target.value;
        rememberPage(id);
        onPick?.(id);
        router.push(pagePickerHref(basePath, id, Boolean(allLabel)));
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

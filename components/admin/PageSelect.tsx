"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";

export function PageSelect({ pages, basePath, selected }: { pages: { id: string; name: string }[]; basePath: string; selected?: string }) {
  const router = useRouter();
  return (
    <Select
      aria-label="Status page"
      defaultValue={selected}
      onChange={(e) => router.push(`${basePath}?pageId=${e.target.value}`)}
      className="w-full"
    >
      {pages.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </Select>
  );
}

"use client";

import { useRouter } from "next/navigation";

export function PageSelect({ pages, basePath, selected }: { pages: { id: string; name: string }[]; basePath: string; selected?: string }) {
  const router = useRouter();
  return (
    <select
      defaultValue={selected}
      onChange={(e) => router.push(`${basePath}?pageId=${e.target.value}`)}
      className="w-full border rounded-md px-3 py-2 text-sm"
    >
      {pages.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { COMPONENT_STATUS_LABEL, COMPONENT_STATUS_TONE, type ComponentStatus } from "@/lib/status";

type Service = { id: string; name: string; status: ComponentStatus; visible: boolean; groupName: string };

export function ServiceOverviewList({ services }: { services: Service[] }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const pages = Math.max(1, Math.ceil(services.length / pageSize));
  const currentPage = Math.min(page, pages);
  const rows = services.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  return <>
    <ul className="divide-y divide-line">
      {rows.map((service) => <li key={service.id} className="flex items-center justify-between gap-3 py-3">
        <div className="min-w-0"><p className="flex items-center gap-2 truncate text-sm font-medium text-ink">{service.name}{!service.visible && <Badge>Hidden</Badge>}</p><p className="truncate text-xs text-ink-dim">{service.groupName}</p></div>
        <StatusBadge tone={COMPONENT_STATUS_TONE[service.status]} className="shrink-0">{COMPONENT_STATUS_LABEL[service.status]}</StatusBadge>
      </li>)}
    </ul>
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 text-xs text-ink-dim">
      <span>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, services.length)} of {services.length}</span>
      <div className="flex items-center gap-2"><label htmlFor="overview-service-page-size">Per page</label><select id="overview-service-page-size" className="rounded-control border border-line bg-surface px-2 py-1 text-ink" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>{Array.from(new Set([10, 25, 50, services.length])).sort((a, b) => a - b).map((size) => <option key={size} value={size}>{size === services.length ? `All (${size})` : size}</option>)}</select><Button type="button" size="sm" variant="ghost" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</Button><span>Page {currentPage} of {pages}</span><Button type="button" size="sm" variant="ghost" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</Button></div>
    </div>
  </>;
}

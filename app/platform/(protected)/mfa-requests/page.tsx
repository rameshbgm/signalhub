import Link from "next/link";
import { IdentityHeader } from "@/components/platform/SectionHeaders";
import { MfaRequestsTable } from "@/components/platform/table/MfaRequestsTable";
import { Card } from "@/components/ui/card";
import { activeAdminCount, listRequests, type RequestFilter } from "@/lib/mfa/requests";
import { requirePlatformPageCapability } from "@/lib/platform-page-guard";
import { cn } from "@/lib/utils";

const FILTERS: Array<{ id: RequestFilter; label: string }> = [
  { id: "PENDING", label: "Pending" }, { id: "OVERDUE", label: "Overdue" }, { id: "APPROVED", label: "Approved" },
  { id: "REJECTED", label: "Rejected" }, { id: "CANCELLED", label: "Cancelled" }, { id: "EXPIRED", label: "Expired" }, { id: "ALL", label: "All" },
];

export const dynamic = "force-dynamic";

export default async function MfaRequestsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const actor = await requirePlatformPageCapability("mfa.manage");
  const { status } = await searchParams;
  const filter = FILTERS.find((item) => item.id === status?.toUpperCase())?.id ?? "PENDING";
  const now = new Date();
  const [rows, admins] = await Promise.all([listRequests(filter, now), activeAdminCount()]);

  return (
    <div className="space-y-6">
      <IdentityHeader admin active="mfa-requests" />
      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Link key={item.id} href={`/organization/platform/mfa-requests?status=${item.id.toLowerCase()}`} aria-current={filter === item.id ? "page" : undefined}
            className={cn("rounded-chip border px-3 py-1 text-sm font-medium transition-colors", filter === item.id ? "border-primary bg-primary-soft text-primary-ink" : "border-line text-ink-soft hover:border-line-strong hover:text-ink")}>
            {item.label}
          </Link>
        ))}
      </nav>
      <Card>
        <MfaRequestsTable
          now={now.getTime()}
          soleAdmin={admins === 1}
          filtered={filter !== "ALL"}
          rows={rows.map((row) => ({
            id: row.id, userId: row.userId, type: row.type, reason: row.reason, status: row.status, ipAddress: row.ipAddress,
            userAgent: row.userAgent, createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt.toISOString(),
            decidedAt: row.decidedAt?.toISOString() ?? null, decisionNote: row.decisionNote, breakGlass: row.breakGlass, overdue: row.overdue,
            username: row.username, email: row.email, name: row.name, accountCreatedAt: row.accountCreatedAt.toISOString(),
            deciderUsername: row.deciderUsername, self: row.userId === actor.userId,
          }))}
        />
      </Card>
    </div>
  );
}

import { requireSession } from "@/lib/require-session";
import { prisma } from "@/lib/db";

export default async function AuditLogPage() {
  const { org } = await requireSession();
  const logs = await prisma.auditLog.findMany({ where: { orgId: org.id }, orderBy: { createdAt: "desc" }, take: 200 });

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Audit Log</h1>
      <div className="bg-white border rounded-lg divide-y">
        {logs.map((l) => (
          <div key={l.id} className="p-3 text-sm flex justify-between">
            <span>
              <span className="font-medium">{l.actor}</span> {l.action.toLowerCase().replaceAll("_", " ")}{" "}
              <code className="text-xs bg-gray-100 px-1 rounded">{l.target}</code>
            </span>
            <span className="text-xs text-gray-400">{new Date(l.createdAt).toLocaleString()}</span>
          </div>
        ))}
        {logs.length === 0 && <p className="p-3 text-sm text-gray-400">No activity yet.</p>}
      </div>
    </div>
  );
}

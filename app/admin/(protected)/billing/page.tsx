import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { PLANS, getPlan, getUsage } from "@/lib/billing";
import { switchPlan } from "./actions";

function limitLabel(n: number) {
  return Number.isFinite(n) ? String(n) : "Unlimited";
}

export default async function BillingPage() {
  const { session, org } = await requireSession();
  const plan = getPlan(org.plan);
  const usage = await getUsage(org.id);
  const invoices = (
    await collections.invoices().find({ orgId: oid(org.id) }).sort({ createdAt: -1 }).limit(24).toArray()
  ).map(toId);
  const isAdmin = session.role === "TENANT_ADMIN";

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Billing</h1>
        <p className="text-sm text-gray-500 mt-1">
          Current plan: <span className="font-medium text-gray-900">{plan.name}</span>
          {org.planRenewsAt && <span className="ml-2 text-xs text-gray-400">renews {new Date(org.planRenewsAt).toLocaleDateString()}</span>}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Payments are simulated in this build — switching plans succeeds instantly and records an invoice.
        </p>
      </div>

      <section>
        <h2 className="font-semibold text-sm mb-3">Usage</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <UsageCard label="Status Pages" used={usage.pages} limit={plan.limits.pages} />
          <UsageCard label="Team Members" used={usage.teamMembers} limit={plan.limits.teamMembers} />
          <UsageCard label="Subscribers" used={usage.subscribers} limit={plan.limits.subscribersPerPage} suffix=" / page" />
        </div>
      </section>

      <section>
        <h2 className="font-semibold text-sm mb-3">Plans</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {Object.values(PLANS).map((p) => (
            <div key={p.id} className={`bg-white border rounded-lg p-4 flex flex-col gap-2 ${p.id === plan.id ? "border-blue-500 ring-1 ring-blue-500" : ""}`}>
              <div className="flex items-baseline justify-between">
                <span className="font-semibold">{p.name}</span>
                <span className="text-sm text-gray-500">{p.priceUsd === 0 ? "Free" : `$${p.priceUsd}/mo`}</span>
              </div>
              <ul className="text-xs text-gray-500 space-y-1 flex-1">
                <li>{limitLabel(p.limits.pages)} status page{p.limits.pages === 1 ? "" : "s"}</li>
                <li>{limitLabel(p.limits.teamMembers)} team members</li>
                <li>{limitLabel(p.limits.subscribersPerPage)} subscribers per page</li>
                <li>{p.customDomain ? "Custom domains" : "No custom domains"}</li>
                <li>{p.removeBranding ? "Remove branding" : "Platform branding"}</li>
              </ul>
              {p.id === plan.id ? (
                <span className="text-xs text-center text-blue-600 font-medium py-1.5">Current plan</span>
              ) : isAdmin ? (
                <form action={switchPlan.bind(null, p.id)}>
                  <button className="w-full bg-blue-600 text-white rounded-md py-1.5 text-xs font-medium">
                    Switch to {p.name}
                  </button>
                </form>
              ) : (
                <span className="text-xs text-center text-gray-400 py-1.5">Ask a tenant admin to switch</span>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-semibold text-sm mb-3">Invoices</h2>
        <div className="bg-white border rounded-lg divide-y">
          {invoices.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between p-3 text-sm">
              <div>
                <span className="font-medium capitalize">{inv.plan}</span>
                <span className="text-xs text-gray-400 ml-2">
                  {new Date(inv.periodStart).toLocaleDateString()} – {new Date(inv.periodEnd).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs bg-green-100 text-green-700 rounded px-1.5 py-0.5">{inv.status}</span>
                <span className="font-medium">${inv.amountUsd}</span>
              </div>
            </div>
          ))}
          {invoices.length === 0 && <p className="p-3 text-sm text-gray-400">No invoices yet.</p>}
        </div>
      </section>
    </div>
  );
}

function UsageCard({ label, used, limit, suffix = "" }: { label: string; used: number; limit: number; suffix?: string }) {
  const pct = Number.isFinite(limit) ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="bg-white border rounded-lg p-4">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-lg font-semibold">
        {used} <span className="text-xs text-gray-400 font-normal">/ {limitLabel(limit)}{suffix}</span>
      </p>
      {Number.isFinite(limit) && (
        <div className="h-1.5 bg-gray-100 rounded-full mt-2">
          <div className={`h-1.5 rounded-full ${pct >= 100 ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

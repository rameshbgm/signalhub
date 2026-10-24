import Link from "next/link";
import { ArrowLeft, Gauge } from "lucide-react";
import { requireSession } from "@/lib/require-session";
import { database } from "@/lib/postgres/client";
import { createMetric } from "../actions";
import { FormActionBar } from "@/components/admin/FormActionBar";
import { NoPagesState, PostingTo } from "@/components/admin/operate-ui";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { INPUT_LIMITS } from "@/lib/input-limits";
import { getScopedPages, requireCapability, sessionHasCapability } from "@/lib/admin-guard";

export default async function NewMetricPage({ searchParams }: { searchParams: Promise<{ pageId?: string }> }) {
  const { session, org } = await requireSession();
  await requireCapability("monitor.manage");
  const { pageId: pageIdParam } = await searchParams;
  const pages = await getScopedPages(session, org.id, { isHub: false });
  const pageId = pageIdParam && pages.some((p) => p.id === pageIdParam) ? pageIdParam : pages[0]?.id;
  const backHref = pageId ? `/organization/metrics?pageId=${pageId}` : "/organization/metrics";
  const components = pageId ? await database.selectFrom("components").select(["id", "name"]).where("pageId", "=", pageId).orderBy("order", "asc").execute() : [];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Add a metric"
        icon={Gauge}
        hue="sky"
        description="Name it, choose how it is displayed, then push data points to it."
        actions={
          <Link href={backHref} className={buttonVariants({ variant: "secondary" })}>
            <ArrowLeft aria-hidden size={16} />
            Back to metrics
          </Link>
        }
      />

      {pageId ? (
        <PlatformActionForm successMessage="Metric added" action={createMetric.bind(null, pageId)} className="space-y-6 text-sm">
          <Card>
            <CardHeader tinted>
              <CardTitle>Metric details</CardTitle>
              <CardDescription>What the number is called, how it reads, and which component it belongs to.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Field label="Metric name" htmlFor="metric-name" required>
                  <Input id="metric-name" name="name" maxLength={INPUT_LIMITS.title} placeholder="Metric name (e.g. API Response Time)" required />
                </Field>
                <Field label="Component" htmlFor="metric-component" hint="Metrics are grouped by component in the list.">
                  <Select id="metric-component" aria-label="Component" name="componentId">
                    <option value="">Not tied to a component</option>
                    {components.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                </Field>
                <PostingTo field pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/organization/metrics/new" selected={pageId} />
                <Field label="Unit suffix" htmlFor="metric-suffix" hint="Shown after the value, such as ms or %.">
                  <Input id="metric-suffix" name="suffix" maxLength={INPUT_LIMITS.metricSuffix} placeholder="Unit suffix (e.g. ms, %)" />
                </Field>
                <Field label="Decimal places" htmlFor="metric-decimals" hint="0 to 10">
                  <Input id="metric-decimals" name="decimals" type="number" min={0} max={10} step={1} defaultValue={0} />
                </Field>
                <Field label="Description" htmlFor="metric-description" className="sm:col-span-2 xl:col-span-3">
                  <Input id="metric-description" name="description" maxLength={INPUT_LIMITS.description} placeholder="Description (optional)" />
                </Field>
              </div>
            </CardContent>
          </Card>
          <FormActionBar hint="After adding the metric, push data points from its row or through the API." submitLabel="Add metric" cancelHref={backHref} />
        </PlatformActionForm>
      ) : (
        <NoPagesState description="Metrics belong to a status page. Create one before you add metrics." canCreate={sessionHasCapability(session, "page.configure")} />
      )}
    </div>
  );
}

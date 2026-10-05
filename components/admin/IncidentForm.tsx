"use client";

import { useState } from "react";
import { Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CheckRow } from "@/components/admin/operate-ui";
import { COMPONENT_STATUSES, COMPONENT_STATUS_LABEL, INCIDENT_STATUSES, INCIDENT_STATUS_LABEL, IMPACTS, IMPACT_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";

type Component = { id: string; name: string };

export function IncidentForm({
  action,
  pageId,
  components,
}: {
  action: (formData: FormData) => void;
  pageId: string;
  components: Component[];
}) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("INVESTIGATING");
  const [impact, setImpact] = useState("MAJOR");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [notify, setNotify] = useState(true);

  return (
    <form action={action} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Input type="hidden" name="pageId" value={pageId} />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Incident details</CardTitle>
            <CardDescription>This is the first update your subscribers and visitors will read.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Incident name" htmlFor="incident-name" required>
              <Input id="incident-name" name="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label="Message" htmlFor="incident-body" hint="What is happening, who is affected, and when you will post the next update." required>
              <Textarea id="incident-body" name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={4} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Status" htmlFor="incident-status">
                <Select id="incident-status" aria-label="Status" name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {INCIDENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {INCIDENT_STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Impact" htmlFor="incident-impact">
                <Select id="incident-impact" aria-label="Impact" name="impact" value={impact} onChange={(e) => setImpact(e.target.value)}>
                  {IMPACTS.map((i) => (
                    <option key={i} value={i}>
                      {IMPACT_LABEL[i]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Affected components</CardTitle>
            <CardDescription>Choose what is affected and the status each component should show while the incident is open.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <CheckRow name="pageWide" label="This incident affects the page as a whole" />
            {components.length === 0 ? (
              <EmptyState icon={Boxes} hue="sky" title="No components on this page yet" description="Add components to the page to mark them as affected." className="py-8" />
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {components.map((c) => {
                  const checked = c.id in selected;
                  return (
                    <div key={c.id} className={cn("flex flex-col gap-2 rounded-control border px-3.5 py-2.5 text-sm transition-colors duration-200 sm:flex-row sm:items-center sm:gap-3", checked ? "border-primary/40 bg-primary-soft/50" : "border-line")}>
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-0.5">
                        <Checkbox
                          aria-label={c.name}
                          name="componentIds"
                          value={c.id}
                          checked={checked}
                          onChange={(e) => {
                            const next = { ...selected };
                            if (e.target.checked) next[c.id] = "MAJOR_OUTAGE";
                            else delete next[c.id];
                            setSelected(next);
                          }}
                        />
                        <span className="min-w-0 truncate font-medium text-ink">{c.name}</span>
                      </label>
                      {checked && (
                        <div className="w-full sm:w-56">
                          <Select
                            aria-label={`Status for ${c.name}`}
                            name={`componentStatus_${c.id}`}
                            value={selected[c.id]}
                            onChange={(e) => setSelected({ ...selected, [c.id]: e.target.value })}
                          >
                            {COMPONENT_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {COMPONENT_STATUS_LABEL[s]}
                              </option>
                            ))}
                          </Select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Decide who hears about this incident.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <CheckRow name="notify" checked={notify} onChange={(event) => setNotify(event.target.checked)} label="Notify subscribers" hint="Subscribers of this page receive the first update." />
            <CheckRow name="backfilled" label="Backfill (past incident, no notification)" hint="Record an incident that is already over." />
          </CardContent>
        </Card>
        <Button type="submit" size="lg" className="w-full">Create incident</Button>
      </div>
    </form>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { Boxes } from "lucide-react";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
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
import { INPUT_LIMITS } from "@/lib/input-limits";
import { createIncidentInputSchema, editIncidentInputSchema } from "@/lib/incident-validation";

type Component = { id: string; name: string };
type InitialIncident = { latestUpdateId: string; latestEditedAt: string; publicVisible?: boolean; name: string; body: string; status: string; impact: string; pageWide: boolean; backfilled: boolean; components: { componentId: string; status: string }[] };

export function IncidentForm({
  action,
  pageId,
  components,
  initial,
}: {
  action: (formData: FormData) => void;
  pageId: string;
  components: Component[];
  initial?: InitialIncident;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [status, setStatus] = useState(initial?.status ?? "INVESTIGATING");
  const [impact, setImpact] = useState(initial?.impact ?? "MAJOR");
  const [selected, setSelected] = useState<Record<string, string>>(() => Object.fromEntries(initial?.components.map((component) => [component.componentId, component.status]) ?? []));
  const [notify, setNotify] = useState(false);
  const [pageWide, setPageWide] = useState(initial?.pageWide ?? false);
  const [backfilled, setBackfilled] = useState(initial?.backfilled ?? false);
  const [attempted, setAttempted] = useState(false);
  const resolved = initial?.status === "RESOLVED";
  const scopeLocked = Boolean(initial && (initial.status === "RESOLVED" || status === "RESOLVED"));
  const validation = (initial ? editIncidentInputSchema : createIncidentInputSchema).safeParse({ pageId, name, body, status, impact, pageWide, backfilled, notify,
    components: Object.entries(selected).map(([componentId, componentStatus]) => ({ componentId, status: componentStatus })),
  });
  const errors = validation.success ? [] : Array.from(new Set(validation.error.issues.map((issue) => issue.message)));

  function changeStatus(next: string) {
    setStatus(next);
    if (!initial && next === "RESOLVED") { setBackfilled(true); setNotify(false); }
    if (next === "RESOLVED" && initial) {
      setSelected(Object.fromEntries(initial.components.map((component) => [component.componentId, component.status])));
      setPageWide(initial.pageWide);
    }
  }

  function validateSubmit(event: FormEvent<HTMLFormElement>) {
    setAttempted(true);
    if (!validation.success) {
      event.preventDefault();
      event.currentTarget.dispatchEvent(new Event("signalhub:button-action-complete", { bubbles: true }));
    }
  }

  return (
    <PlatformActionForm action={action} onSubmit={validateSubmit} successMessage={initial ? "Incident saved" : "Incident created"} className={initial ? "grid items-start gap-6" : "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"} messageClassName="empty:hidden lg:col-span-2">
      <Input type="hidden" name="pageId" value={pageId} />
      {initial && <><input type="hidden" name="latestUpdateId" value={initial.latestUpdateId} /><input type="hidden" name="expectedEditedAt" value={initial.latestEditedAt} /></>}
      {resolved && <input type="hidden" name="impact" value={impact} />}
      {initial && backfilled && <input type="hidden" name="backfilled" value="on" />}
      {(initial?.status === "RESOLVED" || backfilled) && <input type="hidden" name="status" value={status} />}
      {scopeLocked && <>
        {pageWide && <input type="hidden" name="pageWide" value="on" />}
        {Object.keys(selected).map((id) => <input key={id} type="hidden" name="componentIds" value={id} />)}
      </>}
      {status === "RESOLVED" && Object.entries(selected).map(([id, componentStatus]) => <input key={id} type="hidden" name={`componentStatus_${id}`} value={componentStatus} />)}

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Incident details</CardTitle>
            <CardDescription>{resolved ? "Correct the title or message. Lifecycle fields and affected-service history stay locked." : initial ? "Correct the incident and its latest public update." : "This is the first update your subscribers and visitors will read."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Incident name" htmlFor="incident-name" required>
              <Input id="incident-name" name="name" maxLength={INPUT_LIMITS.title} value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label="Message" htmlFor="incident-body" hint={resolved ? "Correct the historical message. The incident remains resolved and subscribers will not receive another incident notification." : "What is happening, who is affected, and when you will post the next update."} required>
              <Textarea id="incident-body" name="body" maxLength={INPUT_LIMITS.body} value={body} onChange={(e) => setBody(e.target.value)} rows={4} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Status" htmlFor="incident-status">
                <Select id="incident-status" aria-label="Status" name="status" value={status} disabled={initial?.status === "RESOLVED" || backfilled} onChange={(e) => changeStatus(e.target.value)}>
                  {INCIDENT_STATUSES.map((s) => (
                    <option key={s} value={s} disabled={(initial?.status === "RESOLVED" || backfilled) && s !== "RESOLVED"}>
                      {INCIDENT_STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Impact" htmlFor="incident-impact">
                <Select id="incident-impact" aria-label="Impact" name="impact" value={impact} disabled={resolved} onChange={(e) => setImpact(e.target.value)}>
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

        {attempted && errors.length > 0 && <div role="alert" className="rounded-control border border-danger/30 bg-danger/5 p-3 text-sm text-danger-fg"><ul className="list-disc space-y-1 pl-4">{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
        <Card>
          <CardHeader>
            <CardTitle>Affected components</CardTitle>
            <CardDescription>{scopeLocked ? "On resolution, affected services are kept as history and cannot be changed. Resolution removes this incident’s status contribution; other incidents and monitors may still affect service health." : status === "RESOLVED" ? "Choose the services affected by this past incident. It will not change their current status." : "Choose what is affected and the status each component should show while the incident is open."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <CheckRow name="pageWide" checked={pageWide} disabled={scopeLocked} onChange={(event) => setPageWide(event.target.checked)} label="This incident affects the page as a whole" />
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
                          disabled={scopeLocked}
                          onChange={(e) => {
                            const next = { ...selected };
                            if (e.target.checked) next[c.id] = impact === "NONE" ? "OPERATIONAL" : "MAJOR_OUTAGE";
                            else delete next[c.id];
                            setSelected(next);
                          }}
                        />
                        <span className="min-w-0 truncate font-medium text-ink">{c.name}</span>
                      </label>
                      {checked && status !== "RESOLVED" && (
                        <div className="w-full sm:w-56">
                          <Select
                            aria-label={`Status for ${c.name}`}
                            name={`componentStatus_${c.id}`}
                            value={selected[c.id]}
                            onChange={(e) => setSelected({ ...selected, [c.id]: e.target.value })}
                          >
                            {COMPONENT_STATUSES.map((s) => (
                              <option key={s} value={s} disabled={s === "UNDER_MAINTENANCE"}>
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
            <CheckRow name="notify" checked={notify} disabled={backfilled || resolved || initial?.publicVisible === false} onChange={(event) => setNotify(event.target.checked)} label="Notify subscribers" hint={initial?.publicVisible === false ? "Restore public visibility before notifying subscribers." : resolved ? "Incident notifications are closed. Publish a postmortem for follow-up." : initial ? "Send subscribers this corrected update. Previous notifications cannot be recalled." : "Subscribers of this page receive the first update."} />
            <CheckRow name="backfilled" checked={backfilled} disabled={Boolean(initial)} onChange={(event) => {
              setBackfilled(event.target.checked);
              if (event.target.checked) { changeStatus("RESOLVED"); setNotify(false); }
              else if (!initial) changeStatus("INVESTIGATING");
            }} label="Backfill (past incident, no notification)" hint={initial ? "Backfill history is fixed when the incident is created." : "Record an incident that is already over. It is saved as resolved without sending notifications."} />
          </CardContent>
        </Card>
        <Button type="submit" size="lg" className="w-full">{initial ? "Save incident" : "Create incident"}</Button>
      </div>
    </PlatformActionForm>
  );
}

"use client";

import { toneIcon } from "@/components/admin/page-management-styles";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Pencil, X } from "lucide-react";
import { PageSubmitButton } from "@/components/admin/PageSubmitButton";
import { ServiceGroupSelect, type ServiceGroupOption } from "@/components/admin/ServiceGroupSelect";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogSurface, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export type ServiceMonitorOption = { id: string; name: string; enabled: boolean };

type ExistingService = {
  id: string;
  name: string;
  description: string;
  groupId: string | null;
  visible: boolean;
  showUptime: boolean;
  automatic?: boolean;
};

/**
 * Add or edit a service in a focused dialog, so the services list stays a
 * single flat card. Field names match the createComponent and
 * updateComponentDetails server actions.
 */
export function ServiceEditorDialog({
  pageId,
  groups,
  action,
  service,
  monitors = [],
  initialMonitorId = "",
  initialOpen = false,
  trigger = "button",
  triggerLabel = "Add service",
}: {
  pageId: string;
  groups: ServiceGroupOption[];
  action: (formData: FormData) => Promise<void>;
  service?: ExistingService;
  monitors?: ServiceMonitorOption[];
  initialMonitorId?: string;
  initialOpen?: boolean;
  trigger?: "button" | "icon";
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  useEffect(() => {
    if (!initialOpen) return;
    const frame = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(frame);
  }, [initialOpen]);
  function close() {
    setOpen(false);
    if (initialOpen) router.replace(`/organization/pages/${pageId}/content`, { scroll: false });
  }
  // A fresh key per opening resets the form after a successful add.
  const [session, setSession] = useState(0);
  const editing = Boolean(service);
  const idPrefix = service ? `service-${service.id}` : "new-service";

  let triggerButton: ReactNode;
  if (trigger === "icon") {
    triggerButton = (
      <Button type="button" data-button-guard="off" variant="ghost" size="icon" className={`size-8 ${toneIcon.edit}`} onClick={() => { setSession((value) => value + 1); setOpen(true); }} aria-label={`Edit ${service?.name ?? "service"}`} title="Edit service">
        <Pencil aria-hidden size={16} />
      </Button>
    );
  } else {
    triggerButton = (
      <Button type="button" data-button-guard="off" onClick={() => { setSession((value) => value + 1); setOpen(true); }}>
        {triggerLabel}
      </Button>
    );
  }

  return (
    <>
      {triggerButton}
      {open && createPortal(
        <Dialog open={open} onOpenChange={(_event, data) => { if (!data.open) close(); }}>
          <DialogSurface className="flex max-h-[calc(100dvh-2rem)] max-w-3xl! flex-col overflow-hidden p-0!">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-4 py-4 sm:px-6 sm:py-5">
              <div className="min-w-0">
                <DialogTitle>{editing ? `Edit ${service!.name}` : "Add a service"}</DialogTitle>
                <p className="mt-1 text-sm text-ink-soft">{editing ? "Changes appear on the public page after saving." : "A service is a system whose health visitors can see."}</p>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={close} className="-mr-2 -mt-1 shrink-0">
                <X aria-hidden size={16} />
              </Button>
            </div>
            <ServiceEditorForm
              key={session}
              pageId={pageId}
              groups={groups}
              action={action}
              service={service}
              monitors={monitors}
              initialMonitorId={initialMonitorId}
              initialAutomatic={initialOpen}
              idPrefix={idPrefix}
              onClose={close}
            />
          </DialogSurface>
        </Dialog>,
        document.body,
      )}
    </>
  );
}

function ServiceEditorForm({ pageId, groups, action, service, monitors, initialMonitorId, initialAutomatic, idPrefix, onClose }: {
  pageId: string;
  groups: ServiceGroupOption[];
  action: (formData: FormData) => Promise<void>;
  service?: ExistingService;
  monitors: ServiceMonitorOption[];
  initialMonitorId: string;
  initialAutomatic: boolean;
  idPrefix: string;
  onClose: () => void;
}) {
  const editing = Boolean(service);
  const initialMonitor = monitors.find((monitor) => monitor.id === initialMonitorId);
  const [source, setSource] = useState(initialAutomatic ? "AUTOMATIC" : "");
  const [monitorId, setMonitorId] = useState(initialMonitor?.id ?? "");
  const [name, setName] = useState(service?.name ?? initialMonitor?.name ?? "");
  const monitor = monitors.find((item) => item.id === monitorId);
  return (
    <PlatformActionForm action={action} preserveOnError successMessage={editing ? "Service details saved" : "Service added"} onSuccess={onClose} className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]">
      <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
        {!editing && (
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-medium text-ink">How should this service get its status?</legend>
            {[
              { value: "AUTOMATIC", label: "Automatic — Use a monitor", hint: "A monitor's checks update the service status." },
              { value: "MANUAL", label: "Manual — Update yourself", hint: "Choose the service status using a dropdown." },
            ].map((option) => (
              <label key={option.value} className="flex cursor-pointer items-start gap-3 rounded-control border border-line p-3 text-sm transition-colors hover:bg-sunken has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                <input type="radio" name="statusSource" value={option.value} checked={source === option.value} onChange={() => setSource(option.value)} required autoFocus={option.value === "AUTOMATIC"} className="mt-1 shrink-0 accent-primary" />
                <span><span className="block font-medium text-ink">{option.label}</span><span className="mt-0.5 block text-xs text-ink-soft">{option.hint}</span></span>
              </label>
            ))}
          </fieldset>
        )}
        {!editing && source === "AUTOMATIC" && (
          <div className="space-y-2">
            {monitors.length ? (
              <Field label="Monitor" htmlFor={`${idPrefix}-monitor`} required hint="Only monitors on this page that are not already linked to a service are available.">
                <Select id={`${idPrefix}-monitor`} name="monitorId" aria-label="Monitor" value={monitorId} required onChange={(event) => {
                  const next = monitors.find((item) => item.id === event.target.value);
                  if (!name.trim() || name === monitor?.name) setName(next?.name ?? "");
                  setMonitorId(event.target.value);
                }} className="w-full">
                  <option value="">Choose a monitor</option>
                  {monitors.map((item) => <option key={item.id} value={item.id}>{item.name}{item.enabled ? "" : " (paused)"}</option>)}
                </Select>
              </Field>
            ) : <p className="text-sm text-ink-soft">No available monitors on this page. Create one, then return here to add it as a service.</p>}
            {monitor && !monitor.enabled && <p className="text-sm text-warn-fg">This monitor is paused. Resume it in Monitors to update the service automatically.</p>}
            <Link href={`/organization/monitors/new?pageId=${pageId}&returnToService=true`} className="inline-flex min-h-9 items-center text-sm font-medium text-primary-ink underline underline-offset-4">Create a monitor</Link>
            <p className="text-xs text-ink-soft">Incidents and maintenance can also affect the public status.</p>
          </div>
        )}
        {(editing || source) && (
          <>
            {editing && <p className="text-sm text-ink-soft">Status source: {service!.automatic ? "Automatic — managed by linked monitors" : "Manual — updated by you"}</p>}
            <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
              <Field label="Name" htmlFor={`${idPrefix}-name`} required>
                <Input id={`${idPrefix}-name`} name="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} placeholder="e.g. Public API" autoFocus={editing || source === "MANUAL"} />
              </Field>
              <Field label="Group" htmlFor={`${idPrefix}-group`} hint="Optional. Use + to add or manage groups.">
                <ServiceGroupSelect pageId={pageId} groups={groups} id={`${idPrefix}-group`} defaultValue={service?.groupId ?? ""} ariaLabel={editing ? `Group for ${service!.name}` : "Service group"} />
              </Field>
            </div>
            <Field label="Description" htmlFor={`${idPrefix}-description`} hint="Optional. Shown to visitors next to the service.">
              <Input id={`${idPrefix}-description`} name="description" defaultValue={service?.description ?? ""} maxLength={1000} />
            </Field>
            {editing && (
              <fieldset className="space-y-2">
                <legend className="sr-only">Visibility</legend>
                <label className="flex items-center gap-2 text-sm text-ink-soft"><Checkbox name="visible" defaultChecked={service!.visible} /> Published on the public page</label>
                <label className="flex items-center gap-2 text-sm text-ink-soft"><Checkbox name="showUptime" defaultChecked={service!.showUptime} /> Show uptime</label>
              </fieldset>
            )}
          </>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-4 py-4 sm:px-6 [&>button]:flex-1 sm:[&>button]:flex-none">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <PageSubmitButton disabled={!editing && (!source || (source === "AUTOMATIC" && !monitor))} pendingLabel={editing ? "Saving…" : "Adding…"}>{editing ? "Save service" : "Add service"}</PageSubmitButton>
      </div>
    </PlatformActionForm>
  );
}

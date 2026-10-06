"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Pencil, Plus, X } from "lucide-react";
import { PageSubmitButton } from "@/components/admin/PageSubmitButton";
import { ServiceGroupSelect, type ServiceGroupOption } from "@/components/admin/ServiceGroupSelect";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogSurface, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type ExistingService = {
  id: string;
  name: string;
  description: string;
  groupId: string | null;
  visible: boolean;
  showUptime: boolean;
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
  trigger = "button",
}: {
  pageId: string;
  groups: ServiceGroupOption[];
  action: (formData: FormData) => Promise<void>;
  service?: ExistingService;
  trigger?: "button" | "icon";
}) {
  const [open, setOpen] = useState(false);
  // A fresh key per opening resets the form after a successful add.
  const [session, setSession] = useState(0);
  const editing = Boolean(service);
  const idPrefix = service ? `service-${service.id}` : "new-service";

  let triggerButton: ReactNode;
  if (trigger === "icon") {
    triggerButton = (
      <Button type="button" data-button-guard="off" variant="ghost" size="sm" onClick={() => { setSession((value) => value + 1); setOpen(true); }} aria-label={`Edit ${service?.name ?? "service"}`}>
        <Pencil aria-hidden size={14} />
        <span className="max-sm:sr-only">Edit</span>
      </Button>
    );
  } else {
    triggerButton = (
      <Button type="button" data-button-guard="off" onClick={() => { setSession((value) => value + 1); setOpen(true); }}>
        <Plus aria-hidden size={16} />
        Add service
      </Button>
    );
  }

  return (
    <>
      {triggerButton}
      {open && createPortal(
        <Dialog open={open} onOpenChange={(_event, data) => setOpen(data.open)}>
          <DialogSurface>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <DialogTitle>{editing ? `Edit ${service!.name}` : "Add a service"}</DialogTitle>
                <p className="mt-1 text-sm text-ink-soft">{editing ? "Changes appear on the public page after saving." : "A service is a system whose health visitors can see."}</p>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={() => setOpen(false)} className="-mr-2 -mt-1">
                <X aria-hidden size={16} />
              </Button>
            </div>
            <PlatformActionForm
              key={session}
              action={action}
              successMessage={editing ? "Service details saved" : "Service added"}
              onSuccess={() => setOpen(false)}
              className="space-y-4"
            >
              <Field label="Name" htmlFor={`${idPrefix}-name`} required>
                <Input id={`${idPrefix}-name`} name="name" defaultValue={service?.name ?? ""} required maxLength={120} placeholder="e.g. Public API" autoFocus />
              </Field>
              <Field label="Group" htmlFor={`${idPrefix}-group`} hint="Optional. Use + to add or manage groups.">
                <ServiceGroupSelect pageId={pageId} groups={groups} id={`${idPrefix}-group`} defaultValue={service?.groupId ?? ""} ariaLabel={editing ? `Group for ${service!.name}` : "Service group"} />
              </Field>
              <Field label="Description" htmlFor={`${idPrefix}-description`} hint="Optional. Shown to visitors next to the service.">
                <Input id={`${idPrefix}-description`} name="description" defaultValue={service?.description ?? ""} maxLength={1000} />
              </Field>
              {editing && (
                <fieldset className="space-y-2">
                  <legend className="sr-only">Visibility</legend>
                  <label className="flex items-center gap-2 text-sm text-ink-soft"><Checkbox name="visible" defaultChecked={service!.visible} /> Visible publicly</label>
                  <label className="flex items-center gap-2 text-sm text-ink-soft"><Checkbox name="showUptime" defaultChecked={service!.showUptime} /> Show uptime</label>
                </fieldset>
              )}
              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
                <PageSubmitButton pendingLabel={editing ? "Saving…" : "Adding…"}>{editing ? "Save service" : "Add service"}</PageSubmitButton>
              </div>
            </PlatformActionForm>
          </DialogSurface>
        </Dialog>,
        document.body,
      )}
    </>
  );
}

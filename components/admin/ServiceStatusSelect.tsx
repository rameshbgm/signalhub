"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { COMPONENT_STATUSES, COMPONENT_STATUS_LABEL, type ComponentStatus } from "@/lib/status";

/** A service status is only published after the operator explicitly saves it. */
export function ServiceStatusSelect({ action, serviceName, serviceId, status }: {
  action: (formData: FormData) => Promise<void>;
  serviceName: string;
  serviceId: string;
  status: ComponentStatus;
}) {
  const [value, setValue] = useState<ComponentStatus>(status);
  const [saved, setSaved] = useState<ComponentStatus>(status);
  const [pending, startTransition] = useTransition();
  const dirty = value !== saved;

  function save() {
    const next = value;
    startTransition(async () => {
      try {
        const data = new FormData();
        data.set("status", next);
        await action(data);
        setSaved(next);
        toast(`${serviceName} is now ${COMPONENT_STATUS_LABEL[next]}`, "ok");
      } catch (error) {
        toast(error instanceof Error ? error.message : "Could not save service status", "danger");
      }
    });
  }

  return <div className="flex min-w-0 items-center gap-1">
    <Select id={`status-${serviceId}`} aria-label={`Public status for ${serviceName}`} value={value} onChange={(event) => setValue(event.target.value as ComponentStatus)} disabled={pending} className="w-full sm:w-52">
      {COMPONENT_STATUSES.map((option) => <option key={option} value={option}>{COMPONENT_STATUS_LABEL[option]}</option>)}
    </Select>
    <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 text-ok hover:bg-ok-bg hover:text-ok-fg disabled:opacity-35" disabled={!dirty || pending} onClick={save} aria-label={`Save status for ${serviceName}`} title={dirty ? "Save status" : "No status changes"}>
      <Save aria-hidden size={16} />
    </Button>
  </div>;
}

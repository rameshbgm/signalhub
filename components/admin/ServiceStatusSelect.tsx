"use client";

import { useEffect, useRef, useState } from "react";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { Select } from "@/components/ui/select";
import { COMPONENT_STATUSES, COMPONENT_STATUS_LABEL, type ComponentStatus } from "@/lib/status";

/**
 * Public status for one service. Choosing a status saves it immediately, the
 * way operators expect from a status page, so there is no separate button to
 * misalign or forget.
 */
export function ServiceStatusSelect({
  action,
  serviceName,
  serviceId,
  status,
}: {
  action: (formData: FormData) => Promise<void>;
  serviceName: string;
  serviceId: string;
  status: ComponentStatus;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState<string>(status);
  const submitPending = useRef(false);

  // Submit after the new value has rendered into the select's hidden input.
  useEffect(() => {
    if (!submitPending.current) return;
    submitPending.current = false;
    wrapperRef.current?.querySelector("form")?.requestSubmit();
  }, [value]);

  return (
    <div ref={wrapperRef} className="w-full sm:w-52">
    <PlatformActionForm
      action={action}
      successMessage={`${serviceName} is now ${COMPONENT_STATUS_LABEL[value as ComponentStatus] ?? value}`}
      messageClassName="mt-2 empty:hidden"
    >
      <label htmlFor={`status-${serviceId}`} className="sr-only">Public status for {serviceName}</label>
      <Select
        id={`status-${serviceId}`}
        aria-label={`Public status for ${serviceName}`}
        name="status"
        value={value}
        onChange={(event) => { submitPending.current = true; setValue(event.target.value); }}
        className="w-full"
      >
        {COMPONENT_STATUSES.map((option) => <option key={option} value={option}>{COMPONENT_STATUS_LABEL[option]}</option>)}
      </Select>
      <noscript><button type="submit">Update status</button></noscript>
    </PlatformActionForm>
    </div>
  );
}

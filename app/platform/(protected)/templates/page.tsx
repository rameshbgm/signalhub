import { collections } from "@/lib/db";
import { FluentSelect } from "@/components/FluentSelect";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { hasPlatformCapability } from "@/lib/platform-policy";
import { deleteMonitorTemplate, saveMonitorTemplate } from "./actions";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { PlatformSubmitButton } from "@/components/platform/PlatformSubmitButton";

const TYPES = ["HTTP", "TCP", "ICMP", "TLS", "KEYWORD", "DNS", "HEARTBEAT"];

export default async function PlatformTemplatesPage() {
  const actor = await requirePlatformCapability("templates.read");
  const templates = await collections.monitorTemplates().find().sort({ category: 1, name: 1 }).toArray();
  const canManage = hasPlatformCapability(actor.role, "templates.manage");

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="font-mono text-2xl font-semibold text-[var(--fg)]">Global monitor templates</h1>
        <p className="mt-1 text-sm text-[var(--fg-soft)]">
          Curated starting points copied into tenant monitors. Editing a template never mutates existing monitors.
        </p>
      </div>

      {canManage && (
        <details className="border border-[var(--line)] bg-[var(--surface)] p-4">
          <summary className="cursor-pointer font-mono text-sm font-semibold text-[var(--cyan)]">Create template</summary>
          <TemplateForm action={saveMonitorTemplate.bind(null, null)} />
        </details>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {templates.map((template) => (
          <article key={template._id.toHexString()} className="border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-[var(--fg)]">{template.name}</h2>
                  <span className="bg-[var(--cyan-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--cyan)]">{template.type}</span>
                  {!template.enabled && <span className="bg-[var(--bg)] px-2 py-0.5 text-[10px] text-[var(--fg-dim)]">DISABLED</span>}
                </div>
                <p className="mt-1 text-xs text-[var(--fg-dim)]">{template.category}</p>
                <p className="mt-2 text-sm text-[var(--fg-soft)]">{template.description}</p>
              </div>
            </div>
            {canManage && (
              <details className="mt-4 border-t border-[var(--line)] pt-3">
                <summary className="cursor-pointer text-xs font-semibold text-[var(--cyan)]">Edit template</summary>
                <TemplateForm template={template} action={saveMonitorTemplate.bind(null, template._id.toHexString())} />
                <PlatformActionForm
                  action={deleteMonitorTemplate.bind(null, template._id.toHexString())}
                  successMessage="Monitor template deleted."
                  className="mt-3 flex flex-wrap gap-2 border-t border-[var(--line)] pt-3"
                >
                  <input name="reason" minLength={10} required placeholder="Deletion reason" className="min-w-0 flex-1 border border-[var(--red)]/30 bg-[var(--bg)] px-2 py-1.5 text-xs" />
                  <PlatformSubmitButton pendingLabel="Deleting…" confirmMessage={`Delete the ${template.name} global template?`} className="border border-[var(--red)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--red)]">Delete</PlatformSubmitButton>
                </PlatformActionForm>
              </details>
            )}
          </article>
        ))}
        {templates.length === 0 && <p className="border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--fg-dim)]">No monitor templates.</p>}
      </div>
    </div>
  );
}

function TemplateForm({
  template,
  action,
}: {
  template?: {
    name: string;
    category: string;
    description: string;
    type: string;
    target: string;
    port: number | null;
    expectedStatusRange: string;
    keywordMatch: string | null;
    enabled: boolean;
  };
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <PlatformActionForm
      action={action}
      successMessage={template ? "Monitor template updated." : "Monitor template created."}
      className="mt-4 grid gap-3 sm:grid-cols-2"
      messageClassName="sm:col-span-2"
    >
      <Field label="Name" name="name" value={template?.name} required />
      <Field label="Category" name="category" value={template?.category} required />
      <label className="sm:col-span-2 text-xs font-semibold text-[var(--fg)]">
        Description
        <textarea name="description" defaultValue={template?.description} required maxLength={500} className="mt-1 min-h-20 w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm font-normal" />
      </label>
      <div className="text-xs font-semibold text-[var(--fg)]">
        Type
        <FluentSelect aria-label="Type" name="type" defaultValue={template?.type ?? "HTTP"} className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm font-normal">
          {TYPES.map((type) => <option key={type}>{type}</option>)}
        </FluentSelect>
      </div>
      <Field label="Target (not used for heartbeat)" name="target" value={template?.target} />
      <Field label="Port (required for TCP)" name="port" type="number" value={template?.port?.toString()} min={1} max={65_535} />
      <Field label="Expected status range" name="expectedStatusRange" value={template?.expectedStatusRange ?? "200-299"} required pattern="[0-9]{3}-[0-9]{3}" />
      <Field label="Keyword match (required for KEYWORD)" name="keywordMatch" value={template?.keywordMatch ?? undefined} />
      <label className="flex items-center gap-2 self-end pb-2 text-xs font-semibold text-[var(--fg)]">
        <input type="checkbox" name="enabled" defaultChecked={template?.enabled ?? true} /> Enabled
      </label>
      <label className="sm:col-span-2 text-xs font-semibold text-[var(--fg)]">
        Change reason
        <input name="reason" required minLength={10} placeholder="Ticket or rationale" className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm font-normal" />
      </label>
      <div className="sm:col-span-2">
        <PlatformSubmitButton pendingLabel="Saving…" className="bg-[var(--cyan)] px-4 py-2 text-xs font-semibold text-[var(--on-cyan)]">{template ? "Save changes" : "Create template"}</PlatformSubmitButton>
      </div>
    </PlatformActionForm>
  );
}

function Field({
  label,
  name,
  value,
  type = "text",
  required = false,
  min,
  max,
  pattern,
}: {
  label: string;
  name: string;
  value?: string;
  type?: string;
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
}) {
  return (
    <label className="text-xs font-semibold text-[var(--fg)]">
      {label}
      <input name={name} type={type} defaultValue={value} required={required} min={min} max={max} pattern={pattern} className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm font-normal" />
    </label>
  );
}

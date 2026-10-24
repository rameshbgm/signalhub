"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ChevronsUpDown, Pencil, PlugZap, Save, Search, Send, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { removeDestinationProviders, saveDestinationProvider } from "@/app/platform/(protected)/configuration/actions";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { ActionDialog, type DialogRequest } from "@/components/platform/table/ActionDialog";
import { ClientPager } from "@/components/platform/table/ClientPager";
import { BulkBar, reportBatch, SelectAll, useSelection } from "@/components/platform/table/selection";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogSurface, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  DESTINATION_PROVIDERS,
  defaultConfig,
  defaultable,
  fieldVisible,
  providerPickerGroups,
  type DestinationChannel,
  type ProviderField,
} from "@/lib/destination-catalog";

/** Never carries credentials: only whether a shared connection is stored. */
export type AddedProvider = { channel: DestinationChannel; defaults: Record<string, string>; shared: boolean };

type SortKey = "provider" | "group" | "connection";
const guard = { "data-button-busy-mode": "interaction" } as const;

/** The team destination providers a platform administrator added: a table with search, sort, filters, paging, and inline and bulk remove. */
export function DestinationProvidersCard({ added, canManage }: { added: AddedProvider[]; canManage: boolean }) {
  const router = useRouter();
  // `session` remounts the dialog so each opening starts from fresh values.
  const [dialog, setDialog] = useState<{ channel: DestinationChannel | null; session: number } | null>(null);
  const open = (channel: DestinationChannel | null) => setDialog((current) => ({ channel, session: (current?.session ?? 0) + 1 }));
  const [confirmation, setConfirmation] = useState<DialogRequest | null>(null);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("all");
  const [connection, setConnection] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "provider", dir: "asc" });
  const [size, setSize] = useState(10);
  const [pageNumber, setPageNumber] = useState(1);

  const groups = [...new Set(added.map((entry) => DESTINATION_PROVIDERS[entry.channel].group))].sort();
  const needle = q.trim().toLowerCase();
  const sign = sort.dir === "asc" ? 1 : -1;
  const keyOf = (entry: AddedProvider) => sort.key === "group" ? DESTINATION_PROVIDERS[entry.channel].group : sort.key === "connection" ? String(entry.shared) : DESTINATION_PROVIDERS[entry.channel].label;
  const matching = added
    .filter((entry) => {
      const provider = DESTINATION_PROVIDERS[entry.channel];
      return (!needle || `${provider.label} ${provider.group} ${provider.description}`.toLowerCase().includes(needle))
        && (group === "all" || provider.group === group)
        && (connection === "all" || (connection === "shared") === entry.shared);
    })
    .sort((left, right) => keyOf(left).localeCompare(keyOf(right), undefined, { sensitivity: "base" }) * sign);
  const lastPage = Math.max(1, Math.ceil(matching.length / size));
  const page = Math.min(pageNumber, lastPage);
  const visible = matching.slice((page - 1) * size, page * size);
  const selection = useSelection(canManage ? visible.map((entry) => entry.channel) : []);
  const chosen = visible.filter((entry) => selection.has(entry.channel));
  const filtered = Boolean(needle) || group !== "all" || connection !== "all";

  function sortBy(key: SortKey) {
    setSort((current) => ({ key, dir: current.key === key && current.dir === "asc" ? "desc" : "asc" }));
    setPageNumber(1);
  }
  function head(key: SortKey, label: string, className?: string) {
    const active = sort.key === key;
    const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("whitespace-nowrap", className)}>
        <button type="button" onClick={() => sortBy(key)} className={cn("-mx-1.5 inline-flex items-center gap-1.5 rounded-chip px-1.5 py-1 outline-none transition-colors hover:bg-line/60 hover:text-ink focus-visible:ring-[3px] focus-visible:ring-primary/30", active && "text-ink")}>
          {label}<Icon aria-hidden size={13} className={active ? "text-primary" : "text-ink-dim"} />
        </button>
      </TableHead>
    );
  }

  function remove(targets: AddedProvider[]) {
    if (targets.length === 0) return;
    const many = targets.length > 1;
    const anyShared = targets.some((entry) => entry.shared);
    setConfirmation({
      title: many ? `Remove ${targets.length} providers?` : `Remove ${DESTINATION_PROVIDERS[targets[0].channel].label}?`, tone: "danger", confirmLabel: many ? `Remove ${targets.length}` : "Remove",
      warning: <>Organizations can no longer add {many ? "them" : "it"}. {anyShared ? "Destinations using the platform connection stop delivering. " : ""}Destinations organizations connected themselves keep working.</>,
      subjects: targets.map((entry) => DESTINATION_PROVIDERS[entry.channel].label),
      run: async () => {
        const result = await removeDestinationProviders(targets.map((entry) => entry.channel));
        const message = reportBatch("Removed", result, (id) => DESTINATION_PROVIDERS[id as DestinationChannel]?.label ?? id);
        router.refresh();
        if (!message) selection.clear();
        return message;
      },
    });
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>Team destination providers</CardTitle>
          <CardDescription className="max-w-2xl">
            Only providers added here appear in organization consoles. Add credentials to connect a provider once for every organization, or leave them blank and each organization connects its own.
          </CardDescription>
        </div>
        {canManage && <Button type="button" data-button-guard="off" onClick={() => open(null)}>Add provider</Button>}
      </CardHeader>
      {added.length === 0 ? (
        <EmptyState icon={Send} hue="violet" title="No providers added" description="Organizations cannot add team destinations until you add at least one provider." className="m-4 border-dashed bg-transparent py-12" />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 p-4">
            <div className="relative min-w-52 flex-1 sm:max-w-sm">
              <Search aria-hidden size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim" />
              <Input value={q} aria-label="Search providers" placeholder="Search providers…" maxLength={100} className="pl-9" onChange={(event) => { setQ(event.target.value); setPageNumber(1); }} />
            </div>
            <Select aria-label="Group" value={group} onChange={(event) => { setGroup(event.target.value); setPageNumber(1); }} className="h-9 w-44">
              <option value="all">All groups</option>
              {groups.map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
            <Select aria-label="Connection" value={connection} onChange={(event) => { setConnection(event.target.value); setPageNumber(1); }} className="h-9 w-48">
              <option value="all">All connections</option>
              <option value="shared">Shared connection</option>
              <option value="own">Organizations connect their own</option>
            </Select>
            {filtered && <button type="button" onClick={() => { setQ(""); setGroup("all"); setConnection("all"); setPageNumber(1); }} className="inline-flex h-9 items-center gap-1.5 rounded-control px-2.5 text-xs font-medium text-ink-soft outline-none hover:bg-sunken hover:text-ink focus-visible:ring-[3px] focus-visible:ring-primary/30"><X aria-hidden size={13} /> Clear</button>}
          </div>
          {canManage && (
            <BulkBar count={chosen.length} noun="provider" onClear={selection.clear}>
              <Button {...guard} size="sm" variant="destructive" onClick={() => remove(chosen)}><Trash2 aria-hidden size={14} />Remove ({chosen.length})</Button>
            </BulkBar>
          )}
          {matching.length === 0 ? (
            <EmptyState icon={Send} hue="violet" title="No providers match these filters" description="Try a different search or clear the filters." className="m-4 border-dashed bg-transparent py-12" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {canManage && <TableHead className="w-12 pr-0"><SelectAll label="Select all providers on this page" total={visible.length} count={chosen.length} onChange={selection.setAll} /></TableHead>}
                  {head("provider", "Provider")}
                  {head("group", "Group", "max-sm:hidden")}
                  {head("connection", "Connection")}
                  <TableHead className="max-lg:hidden">Defaults</TableHead>
                  {canManage && <TableHead className="!text-center">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((entry) => {
                  const provider = DESTINATION_PROVIDERS[entry.channel];
                  const summary = provider.fields.filter((field) => entry.defaults[field.key]).map((field) => `${field.label}: ${optionLabel(field, entry.defaults[field.key])}`);
                  return (
                    <TableRow key={entry.channel} className={cn("odd:bg-surface even:bg-sunken/45", selection.has(entry.channel) && "!bg-primary-soft/70")}>
                      {canManage && <TableCell className="w-12 pr-0"><Checkbox aria-label={`Select ${provider.label}`} checked={selection.has(entry.channel)} onChange={() => selection.toggle(entry.channel)} /></TableCell>}
                      <TableCell>
                        <p className="font-medium text-ink">{provider.label}</p>
                        <p className="max-w-md truncate text-xs text-ink-dim" title={provider.description}>{provider.description}</p>
                      </TableCell>
                      <TableCell className="text-xs max-sm:hidden">{provider.group}</TableCell>
                      <TableCell><StatusBadge tone={entry.shared ? "ok" : "neutral"}>{entry.shared ? "Shared connection" : "Organizations connect their own"}</StatusBadge></TableCell>
                      <TableCell className="max-w-xs text-xs max-lg:hidden">{summary.length ? <span className="line-clamp-2" title={summary.join(" · ")}>{summary.join(" · ")}</span> : <span className="text-ink-dim">None</span>}</TableCell>
                      {canManage && (
                        <TableCell className="text-center">
                          <div className="inline-flex items-center gap-1.5">
                            <Button {...guard} data-button-guard="off" type="button" variant="secondary" size="sm" aria-label={`Edit ${provider.label}`} onClick={() => open(entry.channel)}><Pencil aria-hidden size={14} /><span className="max-sm:sr-only">Edit</span></Button>
                            <Button {...guard} type="button" variant="ghost" size="sm" aria-label={`Remove ${provider.label}`} onClick={() => remove([entry])} className="hover:!bg-danger-bg hover:!text-danger-fg"><Trash2 aria-hidden size={14} /></Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          <ClientPager total={matching.length} page={page} size={size} noun="provider" onPage={setPageNumber} onSize={(next) => { setSize(next); setPageNumber(1); }} />
        </>
      )}
      <ActionDialog request={confirmation} onClose={() => setConfirmation(null)} />
      {dialog && createPortal(
        <Dialog open onOpenChange={(_event, data) => { if (!data.open) setDialog(null); }}>
          <ProviderDialog key={dialog.session} initialChannel={dialog.channel} added={added} onClose={() => setDialog(null)} />
        </Dialog>,
        document.body,
      )}
    </Card>
  );
}

function ProviderDialog({ initialChannel, added, onClose }: { initialChannel: DestinationChannel | null; added: AddedProvider[]; onClose: () => void }) {
  const editing = initialChannel !== null;
  const [channel, setChannel] = useState(initialChannel);
  const entry = added.find((candidate) => candidate.channel === channel);
  const [values, setValues] = useState<Record<string, string>>(() => initialChannel ? defaultConfig(initialChannel, entry ? { [initialChannel]: entry.defaults } : {}) : {});
  // A successful test keeps the dialog open; only a save closes it.
  const intent = useRef<"test" | "save">("save");
  const provider = channel ? DESTINATION_PROVIDERS[channel] : null;
  const fields = provider?.fields.filter((field) => fieldVisible(field, values)) ?? [];
  const credentials = fields.filter((field) => !defaultable(field));
  const hasCredentials = credentials.some((field) => values[field.key]);

  return (
    <DialogSurface className="max-h-[90vh] max-w-xl overflow-y-auto">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <DialogTitle>{editing ? `Edit ${provider!.label}` : "Add a provider"}</DialogTitle>
          <p className="mt-1 text-sm text-ink-soft">{editing ? "Changes apply to new destinations; organizations keep what they already set." : "It appears in every organization console once saved."}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={onClose} className="-mr-2 -mt-1">
          <X aria-hidden size={16} />
        </Button>
      </div>
      <PlatformActionForm
        action={saveDestinationProvider}
        successMessage={editing ? `${provider?.label} saved` : `${provider?.label} added`}
        onSuccess={() => { if (intent.current === "save") onClose(); }}
        className="space-y-5"
      >
        {!editing && (
          <ProviderPicker
            value={channel}
            exclude={added.map((candidate) => candidate.channel)}
            onPick={(picked) => { setChannel(picked); setValues(defaultConfig(picked)); }}
          />
        )}
        {provider && channel && (
          <>
            <input type="hidden" name="channel" value={channel} />
            {fields.some(defaultable) && (
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-ink">Defaults</legend>
                <p className="-mt-1 text-xs text-ink-dim">Pre-filled for organizations, who can still change them.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {fields.filter(defaultable).map((field) => <ProviderInput key={field.key} field={field} values={values} setValues={setValues} />)}
                </div>
              </fieldset>
            )}
            {credentials.length > 0 && (
              <div className="border-t border-line pt-4">
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-ink">Shared connection <span className="font-normal text-ink-dim">(optional)</span></legend>
                <p className="-mt-1 text-xs leading-5 text-ink-dim">
                  {entry?.shared
                    ? "Saved and encrypted. Leave blank to keep the current connection."
                    : "Fill these to connect once for every organization; they are encrypted and tested before saving. Leave blank and each organization connects its own."}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {credentials.map((field) => <ProviderInput key={field.key} field={field} values={values} setValues={setValues} stored={entry?.shared} />)}
                </div>
              </fieldset>
              </div>
            )}
            <div className="flex flex-col-reverse justify-end gap-2 border-t border-line pt-4 sm:flex-row">
              <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
              {credentials.length > 0 && (
                <Button
                  type="submit"
                  name="intent"
                  value="test"
                  variant="secondary"
                  formNoValidate
                  disabled={!hasCredentials && !entry?.shared}
                  onClick={() => { intent.current = "test"; }}
                >
                  <PlugZap aria-hidden size={16} />
                  Test connection
                </Button>
              )}
              <Button type="submit" name="intent" value="save" onClick={() => { intent.current = "save"; }}>
                <Save aria-hidden size={16} />
                {hasCredentials ? "Verify and save" : editing ? "Save" : "Add provider"}
              </Button>
            </div>
          </>
        )}
      </PlatformActionForm>
    </DialogSurface>
  );
}

function ProviderInput({ field, values, setValues, stored = false }: {
  field: ProviderField;
  values: Record<string, string>;
  setValues: (values: Record<string, string>) => void;
  /** A shared connection exists, so a blank credential keeps the saved one. */
  stored?: boolean;
}) {
  const id = `provider-${field.key}`;
  return (
    <Field label={field.label} htmlFor={id} hint={field.hint}>
      {field.kind === "select" ? (
        <Select id={id} name={`field:${field.key}`} value={values[field.key] ?? field.defaultValue ?? ""} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} className="w-full">
          {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
      ) : (
        <Input
          id={id}
          name={`field:${field.key}`}
          type={field.kind === "secret" ? "password" : field.kind === "url" ? "url" : "text"}
          value={values[field.key] ?? ""}
          onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
          placeholder={stored && !defaultable(field) ? "Saved. Leave blank to keep" : field.placeholder}
          autoComplete="off"
        />
      )}
    </Field>
  );
}

/** Searchable provider list: Custom HTTP on its own first, then every other provider A to Z. */
function ProviderPicker({ value, exclude, onPick }: { value: DestinationChannel | null; exclude: DestinationChannel[]; onPick: (channel: DestinationChannel) => void }) {
  const [open, setOpen] = useState(value === null);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const groups = providerPickerGroups()
    .map((group) => ({
      ...group,
      channels: group.channels.filter((channel) => {
        const provider = DESTINATION_PROVIDERS[channel];
        return !exclude.includes(channel) && `${provider.label} ${provider.group} ${provider.description}`.toLowerCase().includes(needle);
      }),
    }))
    .filter((group) => group.channels.length > 0);
  const pick = (channel: DestinationChannel) => { onPick(channel); setOpen(false); setQuery(""); };

  return (
    <div className="space-y-1.5">
      <span id="provider-picker-label" className="text-sm font-medium text-ink">Provider</span>
      <button
        type="button"
        aria-labelledby="provider-picker-label"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-control border border-line-strong bg-surface px-3 text-left text-sm text-ink outline-none transition-colors hover:border-primary/40 focus-visible:ring-4 focus-visible:ring-primary/25"
      >
        <span className={value ? "" : "text-ink-dim"}>{value ? DESTINATION_PROVIDERS[value].label : "Choose a provider"}</span>
        <ChevronsUpDown aria-hidden size={16} className="text-ink-dim" />
      </button>
      {open && (
        <div className="rounded-control border border-line bg-surface shadow-raised">
          <div className="relative border-b border-line p-2">
            <Search aria-hidden size={16} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-ink-dim" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                // Enter picks the first match instead of submitting; Escape closes the list, not the dialog.
                if (event.key === "Enter") { event.preventDefault(); const first = groups[0]?.channels[0]; if (first) pick(first); }
                if (event.key === "Escape") { event.stopPropagation(); setOpen(false); }
              }}
              placeholder="Search providers"
              aria-label="Search providers"
              className="pl-9"
            />
          </div>
          <div role="listbox" aria-label="Providers" className="max-h-64 overflow-y-auto p-1">
            {groups.map((group) => (
              <div key={group.label} role="group" aria-label={group.label}>
                <p className="px-2.5 pb-1 pt-2 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-dim">{group.label}</p>
                {group.channels.map((channel) => {
                  const provider = DESTINATION_PROVIDERS[channel];
                  return (
                    <button
                      key={channel}
                      type="button"
                      role="option"
                      aria-selected={channel === value}
                      onClick={() => pick(channel)}
                      className="block w-full rounded-control px-2.5 py-2 text-left outline-none hover:bg-sunken focus-visible:bg-sunken aria-selected:bg-primary-soft"
                    >
                      <span className="flex items-center justify-between gap-2 text-sm font-medium text-ink">
                        {provider.label}
                        <span className="text-xs font-normal text-ink-dim">{provider.group}</span>
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-ink-dim">{provider.description}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            {groups.length === 0 && (
              <p className="px-2.5 py-3 text-sm text-ink-dim">No provider matches &ldquo;{query}&rdquo;. Custom HTTP works with any webhook.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function optionLabel(field: ProviderField, value: string) {
  return field.options?.find((option) => option.value === value)?.label ?? value;
}

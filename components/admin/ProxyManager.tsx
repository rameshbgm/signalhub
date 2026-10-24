"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Pencil, ShieldCheck, Trash2 } from "lucide-react";
import { PageSubmitButton } from "@/components/admin/PageSubmitButton";
import { InlineActionForm } from "@/components/InlineActionForm";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions, DialogSurface, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PROXY_PROTOCOLS, proxyLabel, type ProxyItem } from "@/lib/proxy-shared";

type Editing = ProxyItem | "new" | null;

function ProxyForm({ proxy, action, onDone }: { proxy: ProxyItem | null; action: (formData: FormData) => Promise<void>; onDone: () => void }) {
  const [hasAuth, setHasAuth] = useState(Boolean(proxy?.username));
  return (
    <PlatformActionForm action={action} preserveOnError successMessage={proxy ? "Proxy saved" : "Proxy added"} onSuccess={onDone} className="space-y-4 text-sm">
      <Field label="Proxy protocol" htmlFor="proxy-protocol">
        <Select id="proxy-protocol" aria-label="Proxy protocol" name="protocol" defaultValue={proxy?.protocol ?? "HTTPS"}>
          {PROXY_PROTOCOLS.map((protocol) => <option key={protocol} value={protocol}>{protocol}</option>)}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]">
        <Field label="Proxy server" htmlFor="proxy-host" required>
          <Input id="proxy-host" name="host" defaultValue={proxy?.host ?? ""} maxLength={255} placeholder="Server address" className="font-mono" required />
        </Field>
        <Field label="Port" htmlFor="proxy-port" required>
          <Input id="proxy-port" name="port" type="number" min={1} max={65535} defaultValue={proxy?.port} placeholder="Port" required />
        </Field>
      </div>
      <Switch name="hasAuth" checked={hasAuth} onChange={(event) => setHasAuth(event.target.checked)} label="Proxy server has authentication" />
      {hasAuth && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Username" htmlFor="proxy-username">
            <Input id="proxy-username" name="username" defaultValue={proxy?.username ?? ""} maxLength={255} autoComplete="off" />
          </Field>
          <Field label="Password" htmlFor="proxy-password">
            <Input id="proxy-password" name="password" type="password" maxLength={1000} autoComplete="new-password" placeholder={proxy?.hasPassword ? "Leave blank to keep current" : "Password"} />
          </Field>
        </div>
      )}
      <div className="space-y-4 border-t border-line pt-4">
        <Switch name="enabled" defaultChecked={proxy?.enabled ?? true} label="Enabled" hint="This proxy has no effect on monitor requests until it is enabled. Turn it off to send monitors straight to their targets again." />
        <Switch name="isDefault" defaultChecked={proxy?.isDefault ?? false} label="Set as default" hint="New monitors start with this proxy selected. You can still pick another proxy, or none, for each monitor." />
        <Switch name="applyToAll" label="Apply on all existing monitors" hint="Switches every HTTP and keyword monitor in this organization to this proxy when you save." />
      </div>
      <DialogActions>
        <Button type="button" variant="secondary" data-button-guard="off" onClick={onDone}>Cancel</Button>
        <Button type="submit">{proxy ? "Save proxy" : "Add proxy"}</Button>
      </DialogActions>
    </PlatformActionForm>
  );
}

/** "Set up proxy" button and its dialog: list, add, edit and delete the organization's outbound proxies. */
export function ProxyManager({ proxies, createProxy }: { proxies: ProxyItem[]; createProxy: (formData: FormData) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const close = () => { setOpen(false); setEditing(null); };
  // With nothing saved yet there is nothing to list, so go straight to the form.
  const view: Editing = editing ?? (proxies.length === 0 ? "new" : null);

  return (
    <>
      <Button type="button" variant="secondary" data-button-guard="off" onClick={() => setOpen(true)}>
        <ShieldCheck aria-hidden size={16} />
        Set up proxy
      </Button>
      {open && createPortal(
        <Dialog open onOpenChange={(_event, data) => { if (!data.open) close(); }}>
          <DialogSurface className="max-h-[90dvh] space-y-4 overflow-y-auto">
            <div className="flex items-center gap-2">
              {view && proxies.length > 0 && (
                <Button type="button" variant="ghost" size="icon" data-button-guard="off" aria-label="Back to proxies" onClick={() => setEditing(null)} className="-ml-2 size-8">
                  <ArrowLeft aria-hidden size={16} />
                </Button>
              )}
              <DialogTitle>{view === "new" ? "Set up proxy" : view ? "Edit proxy" : "Proxies"}</DialogTitle>
            </div>
            {view ? (
              <ProxyForm key={view === "new" ? "new" : view.id} proxy={view === "new" ? null : view} action={view === "new" ? createProxy : view.save} onDone={() => (proxies.length === 0 ? close() : setEditing(null))} />
            ) : (
              <>
                <ul className="divide-y divide-line rounded-card border border-line">
                  {proxies.map((proxy) => (
                    <li key={proxy.id} className="flex items-center gap-2 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-sm text-ink" title={proxyLabel(proxy)}>{proxyLabel(proxy)}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {proxy.isDefault && <Badge>Default</Badge>}
                          {!proxy.enabled && <Badge className="border-line bg-sunken text-ink-soft">Disabled</Badge>}
                          {proxy.username && <Badge className="border-line bg-sunken text-ink-soft">Authenticated</Badge>}
                        </div>
                      </div>
                      <Button type="button" variant="ghost" size="icon" data-button-guard="off" className="size-8 [&_svg]:!text-primary-ink" aria-label={`Edit ${proxyLabel(proxy)}`} onClick={() => setEditing(proxy)}>
                        <Pencil aria-hidden size={15} />
                      </Button>
                      <InlineActionForm action={proxy.remove}>
                        <PageSubmitButton variant="ghost" size="icon" pendingLabel="…" title="Delete" className="size-8 hover:bg-danger-bg [&_svg]:!text-danger-fg" confirmMessage={`Delete the proxy ${proxyLabel(proxy)}? Monitors using it will connect directly.`}>
                          <Trash2 aria-hidden size={15} />
                          <span className="sr-only">Delete {proxyLabel(proxy)}</span>
                        </PageSubmitButton>
                      </InlineActionForm>
                    </li>
                  ))}
                </ul>
                <DialogActions>
                  <Button type="button" variant="secondary" data-button-guard="off" onClick={close}>Close</Button>
                  <Button type="button" data-button-guard="off" onClick={() => setEditing("new")}>
                    Add proxy
                  </Button>
                </DialogActions>
              </>
            )}
          </DialogSurface>
        </Dialog>,
        document.body,
      )}
    </>
  );
}

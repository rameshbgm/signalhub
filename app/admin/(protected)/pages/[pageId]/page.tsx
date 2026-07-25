import { notFound } from "next/navigation";
import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { COMPONENT_STATUSES, COMPONENT_STATUS_LABEL } from "@/lib/status";
import { updatePageSettings, deletePage } from "../actions";
import { createGroup, deleteGroup, createComponent, updateComponentStatus, updateComponentDetails, deleteComponent } from "./components-actions";
import { createAccessGroup, deleteAccessGroup, createAccessUser, deleteAccessUser } from "./access-actions";
import { LayoutPicker } from "@/components/admin/LayoutPicker";
import { HelpTip } from "@/components/HelpTip";
import { AutomationTokenManager } from "@/components/admin/AutomationTokenManager";
import { secretLabel } from "@/lib/secrets";
import { AssetUploader } from "@/components/admin/AssetUploader";
import { publicPagePath } from "@/lib/public-path";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";

export default async function PageDetail({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const { org } = await requireSession();
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const pageDoc = await collections.pages().findOne({ _id: oid(pageId), orgId: oid(org.id) });
  if (!pageDoc) notFound();
  const page = toId(pageDoc);

  const [groupDocs, ungroupedDocs, providerDocs] = await Promise.all([
    collections.componentGroups().find({ pageId: oid(pageId) }).sort({ order: 1 }).toArray(),
    collections.components().find({ pageId: oid(pageId), groupId: null }).sort({ order: 1 }).toArray(),
    collections.monitorTemplates().find({ enabled: true }).sort({ name: 1 }).toArray(),
  ]);
  const allComponentDocs = await collections.components().find({ pageId: oid(pageId) }).sort({ order: 1 }).toArray();
  const componentsByGroup = new Map<string, typeof allComponentDocs>();
  for (const c of allComponentDocs) {
    if (!c.groupId) continue;
    const key = c.groupId.toHexString();
    if (!componentsByGroup.has(key)) componentsByGroup.set(key, []);
    componentsByGroup.get(key)!.push(c);
  }

  const groups = groupDocs.map((g) => ({
    ...toId(g),
    components: (componentsByGroup.get(g._id.toHexString()) ?? []).map(toId),
  }));
  const ungrouped = ungroupedDocs.map(toId);
  const providers = providerDocs.map(toId);
  const allComponents = [...groups.flatMap((g) => g.components), ...ungrouped];

  const { accessGroups, accessUsers } = page.type === "AUDIENCE" ? await loadAudienceAccess(pageId) : { accessGroups: [], accessUsers: [] };

  const boundUpdatePage = updatePageSettings.bind(null, pageId);
  const boundDeletePage = deletePage.bind(null, pageId);
  const boundCreateGroup = createGroup.bind(null, pageId);
  const boundCreateComponent = createComponent.bind(null, pageId);
  const boundCreateAccessGroup = createAccessGroup.bind(null, pageId);
  const boundCreateAccessUser = createAccessUser.bind(null, pageId);

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-mono text-xl font-semibold text-[var(--fg)]">{page.name}</h1>
        <a href={publicPagePath(page)} target="_blank" rel="noreferrer" className="text-sm text-[var(--cyan)] hover:underline">
          View public page →
        </a>
      </div>

      <section className="bg-[var(--surface)] border border-[var(--line)] p-4 sm:p-5">
        <h2 className="font-mono font-semibold mb-4 text-[var(--fg)]">Branding & Settings</h2>
        <form action={boundUpdatePage} className="grid sm:grid-cols-2 gap-4">
          <LayoutPicker defaultValue={page.layout ?? "STANDARD"} brandColor={page.brandColor} />
          <Field label="Page name">
            <input name="name" defaultValue={page.name} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none" />
          </Field>
          <Field label="Headline">
            <input name="headline" defaultValue={page.headline} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none" />
          </Field>
          <Field label="About text" full>
            <textarea name="aboutText" defaultValue={page.aboutText} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none" rows={2} />
          </Field>
          <Field label="Support URL">
            <input name="supportUrl" defaultValue={page.supportUrl ?? ""} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none" />
          </Field>
          <Field label="Terms of Service URL">
            <input name="termsUrl" defaultValue={page.termsUrl ?? ""} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none" />
          </Field>
          <Field label="Privacy Policy URL">
            <input name="privacyUrl" defaultValue={page.privacyUrl ?? ""} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none" />
          </Field>
          <Field label="Brand color">
            <input name="brandColor" type="color" defaultValue={page.brandColor} className="w-16 h-9 border border-[var(--line)] bg-[var(--bg)]" />
          </Field>
          <Field label="Theme preset">
            <select name="themePreset" defaultValue={page.themePreset ?? "SIGNAL"} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm">
              <option value="SIGNAL">Signal</option>
              <option value="CALM">Calm</option>
              <option value="CONTRAST">High contrast</option>
            </select>
          </Field>
          <Field label="Color mode">
            <select name="themeMode" defaultValue={page.themeMode ?? "SYSTEM"} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm">
              <option value="SYSTEM">Follow visitor system</option>
              <option value="LIGHT">Always light</option>
              <option value="DARK">Always dark</option>
            </select>
          </Field>
          <Field label="Logo URL">
            <input name="logoUrl" defaultValue={page.logoUrl ?? ""} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none" />
          </Field>
          <Field label="Favicon URL">
            <input name="faviconUrl" defaultValue={page.faviconUrl ?? ""} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none" />
          </Field>
          <Field label="Cover image URL (used by cover layout)">
            <input name="coverImageUrl" defaultValue={page.coverImageUrl ?? ""} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none" />
          </Field>
          <Field label="Custom domain — point a CNAME at this app's domain">
            <input name="customDomain" defaultValue={page.customDomain ?? ""} placeholder="signal.yourcompany.com" className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)] focus:outline-none" />
          </Field>
          <Field label="Timezone">
            <input name="timezone" defaultValue={page.timezone} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none" />
          </Field>
          <Field label="Language">
            <input name="language" defaultValue={page.language} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none" />
          </Field>
          {page.type === "PRIVATE" && (
            <Field label="New password (leave blank to keep)">
              <input name="password" type="password" className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none" />
            </Field>
          )}
          <Field label="Custom CSS" full>
            <textarea name="customCss" defaultValue={page.customCss ?? ""} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm font-mono text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none" rows={3} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-[var(--fg-soft)]">
            <input type="checkbox" name="removeBranding" defaultChecked={page.removeBranding} /> Remove &quot;Powered by&quot; branding
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--fg-soft)]">
            <input type="checkbox" name="allowThemeOverride" defaultChecked={page.allowThemeOverride ?? true} /> Allow visitor theme switch
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--fg-soft)]">
            <input type="checkbox" name="analyticsEnabled" defaultChecked={page.analyticsEnabled ?? true} /> Privacy-first page analytics
          </label>
          <div className="sm:col-span-2">
            <button className="bg-[var(--cyan)] text-[var(--on-cyan)] px-4 py-2 text-sm font-semibold font-mono">Save Settings</button>
          </div>
        </form>
        <div className="mt-6 grid gap-4 border-t border-[var(--line)] pt-6 sm:grid-cols-3">
          <AssetUploader pageId={pageId} kind="LOGO" currentUrl={page.logoUrl} label="Logo" help="Preserves the original aspect ratio." />
          <AssetUploader pageId={pageId} kind="FAVICON" currentUrl={page.faviconUrl} label="Favicon" help="Shown in supported browsers and feeds." />
          <AssetUploader pageId={pageId} kind="COVER" currentUrl={page.coverImageUrl} label="Cover image" help="Optimized for wide responsive headers." />
        </div>
      </section>

      <section className="bg-[var(--surface)] border border-[var(--line)] p-4 sm:p-5">
        <h2 className="font-mono font-semibold mb-4 text-[var(--fg)]">Component Groups</h2>
        <form action={boundCreateGroup} className="flex flex-col gap-2 mb-4 sm:flex-row">
          <input name="name" placeholder="New group name" className="flex-1 border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)] focus:outline-none" required />
          <button className="bg-[var(--surface-raised)] border border-[var(--line-bright)] text-[var(--fg)] px-3 py-2 text-sm">Add Group</button>
        </form>
        <div className="space-y-2">
          {groups.map((g) => (
            <div key={g.id} className="flex items-center justify-between text-sm border border-[var(--line)] px-3 py-2">
              <span className="text-[var(--fg)]">{g.name} ({g.components.length})</span>
              <form action={deleteGroup.bind(null, pageId, g.id)}>
                <button className="border border-[var(--red)]/30 px-2 py-0.5 text-xs font-semibold text-[var(--red)] transition-colors hover:bg-[var(--red-soft)]">Delete</button>
              </form>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[var(--surface)] border border-[var(--line)] p-4 sm:p-5">
        <h2 className="font-mono font-semibold mb-4 text-[var(--fg)]">Components</h2>
        <form action={boundCreateComponent} className="grid sm:grid-cols-2 gap-3 mb-6 border-b border-[var(--line)] pb-6">
          <input name="name" placeholder="Component name" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)] focus:outline-none" />
          <select name="groupId" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none">
            <option value="">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <input name="description" placeholder="Description (optional)" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)] focus:outline-none sm:col-span-2" />
          <label htmlFor="monitor-template" className="flex items-center gap-2 text-sm text-[var(--fg-soft)]">
            Optional monitor template
            <HelpTip text="Creates an enabled worker-backed monitor with editable settings for this component." />
          </label>
          <select id="monitor-template" name="monitorTemplateId" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none">
            <option value="">No template</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.category})
              </option>
            ))}
          </select>
          <div className="sm:col-span-2">
            <button className="bg-[var(--cyan)] text-[var(--on-cyan)] px-4 py-2 text-sm font-semibold font-mono">Add Component</button>
          </div>
        </form>

        <div className="space-y-2">
          {[...groups.flatMap((g) => g.components.map((c) => ({ ...c, groupName: g.name }))), ...ungrouped.map((c) => ({ ...c, groupName: "—" }))].map(
            (c) => (
              <div key={c.id} className="border border-[var(--line)] p-3 text-sm space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-medium text-[var(--fg)]">{c.name}</span>
                    <span className="text-xs text-[var(--fg-dim)] ml-2">{c.groupName}</span>
                    {c.isThirdParty && <span className="text-[10px] uppercase tracking-wide bg-[var(--blue-soft)] text-[var(--blue)] px-1.5 py-0.5 ml-2">monitored template</span>}
                  </div>
                  <form action={deleteComponent.bind(null, pageId, c.id)}>
                    <button className="border border-[var(--red)]/30 px-2 py-0.5 text-xs font-semibold text-[var(--red)] shrink-0 transition-colors hover:bg-[var(--red-soft)]">Delete</button>
                  </form>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <form action={updateComponentStatus.bind(null, pageId, c.id)} className="flex items-center gap-2">
                    <select name="status" defaultValue={c.status} className="border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none">
                      {COMPONENT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {COMPONENT_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                    <button className="bg-[var(--surface-raised)] border border-[var(--line-bright)] text-[var(--fg)] px-2 py-1 text-xs">Update Status</button>
                  </form>
                  <span className="text-xs text-[var(--fg-dim)] flex items-center gap-1">
                    Automation webhook:{" "}
                    <AutomationTokenManager
                      componentId={c.id}
                      label={secretLabel(c.automationTokenPrefix, c.automationTokenLastFour)}
                    />
                    <HelpTip text="POST a status value to this URL to update the component automatically from your own monitoring." />
                  </span>
                </div>
                <form action={updateComponentDetails.bind(null, pageId, c.id)} className="flex flex-wrap items-end gap-2 pt-2 border-t border-[var(--line)]">
                  <input name="name" defaultValue={c.name} className="border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--fg)] w-40 focus:border-[var(--cyan)] focus:outline-none" />
                  <input name="description" defaultValue={c.description} placeholder="Description" className="border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--fg)] placeholder:text-[var(--fg-dim)] flex-1 min-w-[10rem] focus:border-[var(--cyan)] focus:outline-none" />
                  <input name="order" type="number" defaultValue={c.order} className="border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--fg)] w-16 focus:border-[var(--cyan)] focus:outline-none" />
                  <select name="groupId" defaultValue={c.groupId ?? ""} className="border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none">
                    <option value="">No group</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-xs text-[var(--fg-soft)]">
                    <input type="checkbox" name="visible" defaultChecked={c.visible} /> Visible
                  </label>
                  <label className="flex items-center gap-1 text-xs text-[var(--fg-soft)]">
                    <input type="checkbox" name="showUptime" defaultChecked={c.showUptime} /> Show uptime
                  </label>
                  <button className="bg-[var(--surface-raised)] border border-[var(--line-bright)] text-[var(--fg)] px-2 py-1 text-xs">Save Details</button>
                </form>
              </div>
            )
          )}
        </div>
      </section>

      {page.type === "AUDIENCE" && (
        <section className="bg-[var(--surface)] border border-[var(--line)] p-4 sm:p-5">
          <h2 className="font-mono font-semibold mb-4 text-[var(--fg)]">Audience Access</h2>
          <p className="text-xs text-[var(--fg-dim)] mb-4">
            Each visitor logs in and sees only the components assigned to their user or group. Assign components below.
          </p>

          <h3 className="text-sm font-semibold mb-2 text-[var(--fg)]">Access Groups</h3>
          <form action={boundCreateAccessGroup} className="grid sm:grid-cols-2 gap-3 mb-4 border-b border-[var(--line)] pb-4">
            <input name="name" placeholder="Group name" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)] focus:outline-none" required />
            <div className="flex flex-wrap gap-2 border border-[var(--line)] p-2 text-xs text-[var(--fg-soft)]">
              {allComponents.map((c) => (
                <label key={c.id} className="flex items-center gap-1">
                  <input type="checkbox" name="componentIds" value={c.id} /> {c.name}
                </label>
              ))}
            </div>
            <button className="bg-[var(--surface-raised)] border border-[var(--line-bright)] text-[var(--fg)] px-3 py-2 text-sm sm:col-span-2 w-fit">Add Group</button>
          </form>
          <div className="space-y-1 mb-6">
            {accessGroups.map((g) => (
              <div key={g.id} className="flex items-center justify-between text-sm border border-[var(--line)] px-3 py-2">
                <span className="text-[var(--fg)]">{g.name}</span>
                <form action={deleteAccessGroup.bind(null, pageId, g.id)}>
                  <button className="border border-[var(--red)]/30 px-2 py-0.5 text-xs font-semibold text-[var(--red)] transition-colors hover:bg-[var(--red-soft)]">Delete</button>
                </form>
              </div>
            ))}
          </div>

          <h3 className="text-sm font-semibold mb-2 text-[var(--fg)]">Access Users</h3>
          <form action={boundCreateAccessUser} className="grid sm:grid-cols-2 gap-3 mb-4 border-b border-[var(--line)] pb-4">
            <input name="email" type="email" placeholder="Customer email" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)] focus:outline-none" required />
            <input name="password" type="password" placeholder="Password" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)] focus:outline-none" required />
            <select name="groupId" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none">
              <option value="">No group</option>
              {accessGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2 border border-[var(--line)] p-2 text-xs text-[var(--fg-soft)]">
              {allComponents.map((c) => (
                <label key={c.id} className="flex items-center gap-1">
                  <input type="checkbox" name="componentIds" value={c.id} /> {c.name}
                </label>
              ))}
            </div>
            <button className="bg-[var(--cyan)] text-[var(--on-cyan)] px-3 py-2 text-sm font-semibold sm:col-span-2 w-fit">Add User</button>
          </form>
          <div className="space-y-1">
            {accessUsers.map((u) => (
              <div key={u.id} className="flex items-center justify-between text-sm border border-[var(--line)] px-3 py-2">
                <span className="text-[var(--fg)]">
                  {u.email} {u.group && <span className="text-xs text-[var(--fg-dim)] ml-2">{u.group.name}</span>}
                </span>
                <form action={deleteAccessUser.bind(null, pageId, u.id)}>
                  <button className="border border-[var(--red)]/30 px-2 py-0.5 text-xs font-semibold text-[var(--red)] transition-colors hover:bg-[var(--red-soft)]">Delete</button>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bg-[var(--surface)] border border-[var(--red)]/30 p-4 sm:p-5">
        <h2 className="font-mono font-semibold mb-2 text-[var(--red)]">Danger Zone</h2>
        <form action={boundDeletePage} className="flex items-center gap-2">
          <button className="text-red-400 border border-red-400/40 px-3 py-1.5 text-sm hover:bg-[var(--red-soft)]">Delete this page</button>
          <HelpTip text="Permanently deletes this page and all of its components, incidents, and subscribers. This cannot be undone." />
        </form>
      </section>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block text-sm ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-xs text-[var(--fg-dim)] block mb-1">{label}</span>
      {children}
    </label>
  );
}

async function loadAudienceAccess(pageId: string) {
  const accessGroupDocs = await collections.pageAccessGroups().find({ pageId: oid(pageId) }).toArray();
  const accessGroups = accessGroupDocs.map(toId);
  const accessGroupById = new Map(accessGroupDocs.map((g) => [g._id.toHexString(), toId(g)]));
  const accessUserDocs = await collections.pageAccessUsers().find({ pageId: oid(pageId) }).toArray();
  const accessUsers = accessUserDocs.map((u) => ({
    ...toId(u),
    group: u.groupId ? accessGroupById.get(u.groupId.toHexString()) ?? null : null,
  }));
  return { accessGroups, accessUsers };
}

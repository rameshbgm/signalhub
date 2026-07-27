import { notFound } from "next/navigation";
import { FluentSelect } from "@/components/FluentSelect";
import { FluentTextarea } from "@/components/FluentTextarea";
import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { COMPONENT_STATUSES, COMPONENT_STATUS_LABEL } from "@/lib/status";
import { updatePageSettings, deletePage, setPagePublicVisibility } from "../actions";
import { createGroup, deleteGroup, createComponent, updateComponentStatus, deleteComponent } from "./components-actions";
import { createAccessGroup, deleteAccessGroup, createAccessUser, deleteAccessUser } from "./access-actions";
import { LayoutPicker } from "@/components/admin/LayoutPicker";
import { HelpTip } from "@/components/HelpTip";
import { AutomationTokenManager } from "@/components/admin/AutomationTokenManager";
import { secretLabel } from "@/lib/secrets";
import { AssetUploader } from "@/components/admin/AssetUploader";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { PlatformSubmitButton } from "@/components/platform/PlatformSubmitButton";
import { publicPagePath } from "@/lib/public-path";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { ComponentOrderList } from "@/components/admin/ComponentOrderList";

export default async function PageDetail({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const { org } = await requireSession();
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const pageDoc = await collections.pages().findOne({ _id: oid(pageId), orgId: oid(org.id) });
  if (!pageDoc) notFound();
  const page = toId(pageDoc);

  const [groupDocs, ungroupedDocs] = await Promise.all([
    collections.componentGroups().find({ pageId: oid(pageId) }).sort({ order: 1 }).toArray(),
    collections.components().find({ pageId: oid(pageId), groupId: null }).sort({ order: 1 }).toArray(),
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
  const allComponents = [...groups.flatMap((g) => g.components), ...ungrouped];
  const editableComponents = [...groups.flatMap((g) => g.components.map((c) => ({ ...c, groupName: g.name }))), ...ungrouped.map((c) => ({ ...c, groupName: "—" }))];

  const { accessGroups, accessUsers } = page.type === "AUDIENCE" ? await loadAudienceAccess(pageId) : { accessGroups: [], accessUsers: [] };

  const boundUpdatePage = updatePageSettings.bind(null, pageId);
  const boundDeletePage = deletePage.bind(null, pageId);
  const boundShowPage = setPagePublicVisibility.bind(null, pageId, true);
  const boundHidePage = setPagePublicVisibility.bind(null, pageId, false);
  const boundCreateGroup = createGroup.bind(null, pageId);
  const boundCreateComponent = createComponent.bind(null, pageId);
  const boundCreateAccessGroup = createAccessGroup.bind(null, pageId);
  const boundCreateAccessUser = createAccessUser.bind(null, pageId);

  return (
    <div className="mx-auto w-[86%] space-y-8">
      <form id="page-settings-form" action={boundUpdatePage} className="contents">
      <div className="sticky top-14 z-30 flex flex-col gap-2 border-b border-[var(--line)] bg-[var(--bg)] py-4 sm:flex-row sm:items-center sm:justify-between lg:top-0">
        <h1 className="font-mono text-xl font-semibold text-[var(--fg)]">{page.name}</h1>
        <div className="flex items-center gap-3">
          <a href={`/organization/pages/${pageId}/design`} className="bg-[var(--cyan)] px-4 py-2 text-sm font-semibold text-[var(--on-cyan)]">
            Open visual designer
          </a>
          <PlatformSubmitButton
            pendingLabel="Saving all settings…"
            className="bg-[var(--cyan)] px-4 py-2 font-mono text-sm font-semibold text-[var(--on-cyan)]"
          >
            Save all settings
          </PlatformSubmitButton>
          {page.publicVisible !== false ? (
            <a href={publicPagePath(page)} target="_blank" rel="noreferrer" className="text-sm text-[var(--cyan)] hover:underline">
              View public page →
            </a>
          ) : (
            <span className="border border-[var(--amber)]/40 bg-[var(--amber-soft)] px-2 py-1 font-mono text-xs text-[var(--amber)]">Hidden from public</span>
          )}
        </div>
      </div>

      <section className="bg-[var(--surface)] border border-[var(--line)] p-4 sm:p-5">
        <h2 className="font-mono font-semibold mb-4 text-[var(--fg)]">Branding & Settings</h2>
        <div className="grid sm:grid-cols-2 gap-4">
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
            <FluentSelect aria-label="Theme preset" name="themePreset" defaultValue={page.themePreset ?? "SIGNAL"} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm">
              <option value="SIGNAL">Signal</option>
              <option value="CALM">Calm</option>
              <option value="CONTRAST">High contrast</option>
            </FluentSelect>
          </Field>
          <Field label="Color mode">
            <FluentSelect aria-label="Color mode" name="themeMode" defaultValue={page.themeMode ?? "SYSTEM"} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm">
              <option value="SYSTEM">Follow visitor system</option>
              <option value="LIGHT">Always light</option>
              <option value="DARK">Always dark</option>
            </FluentSelect>
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
          {page.customCss && (
            <div className="sm:col-span-2 border border-[var(--amber)]/30 bg-[var(--amber-soft)] p-3 text-sm text-[var(--amber)]">
              Legacy custom CSS remains active but is frozen. Review or reset it from the visual designer.
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-[var(--fg-soft)]">
            <input type="checkbox" name="removeBranding" defaultChecked={page.removeBranding} /> Remove &quot;Powered by&quot; branding
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--fg-soft)]">
            <input type="checkbox" name="allowThemeOverride" defaultChecked={page.allowThemeOverride ?? true} /> Allow visitor theme switch
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--fg-soft)]">
            <input type="checkbox" name="analyticsEnabled" defaultChecked={page.analyticsEnabled ?? true} /> Privacy-first page analytics
          </label>
        </div>
        <div className="mx-auto mt-6 grid max-w-5xl gap-4 border-t border-[var(--line)] pt-6 sm:grid-cols-2">
          <AssetUploader pageId={pageId} kind="LOGO" currentUrl={page.logoUrl} label="Logo" help="Preserves the original aspect ratio." />
          <AssetUploader pageId={pageId} kind="FAVICON" currentUrl={page.faviconUrl} label="Favicon" help="Shown in supported browsers and feeds." />
          <AssetUploader
            pageId={pageId}
            kind="COVER"
            currentUrl={page.coverImageUrl}
            currentCoverFit={page.coverImageFit}
            currentCoverPositionX={page.coverImagePositionX}
            currentCoverPositionY={page.coverImagePositionY}
            currentCoverCropX={page.coverImageCropX}
            currentCoverCropY={page.coverImageCropY}
            currentCoverCropWidth={page.coverImageCropWidth}
            currentCoverCropHeight={page.coverImageCropHeight}
            label="Cover image"
            help="Draw a crop frame and publish the selected area as a full-width banner."
          />
        </div>
      </section>
      </form>

      <section className="flex flex-col gap-4 border border-[var(--line)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-mono font-semibold text-[var(--fg)]">Public visibility</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--fg-soft)]">
            {page.publicVisible === false
              ? "This page is hidden from visitors. Assigned incident managers and responders can still manage it after signing in."
              : "This page is available on its public URL. Hide it without interrupting signed-in operational work."}
          </p>
        </div>
        <form action={page.publicVisible === false ? boundShowPage : boundHidePage}>
          <PlatformSubmitButton
            pendingLabel={page.publicVisible === false ? "Publishing…" : "Hiding…"}
            confirmMessage={page.publicVisible === false ? undefined : `Hide ${page.name} from the public? Signed-in operators will retain access.`}
            className="shrink-0 border border-[var(--cyan)]/40 px-4 py-2 text-sm font-semibold text-[var(--cyan)] hover:bg-[var(--cyan-soft)]"
          >
            {page.publicVisible === false ? "Publish publicly" : "Hide from public"}
          </PlatformSubmitButton>
        </form>
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
          <FluentSelect aria-label="Component group" name="groupId" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none">
            <option value="">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </FluentSelect>
          <input name="description" placeholder="Description (optional)" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)] focus:outline-none sm:col-span-2" />
          <div className="sm:col-span-2">
            <button className="bg-[var(--cyan)] text-[var(--on-cyan)] px-4 py-2 text-sm font-semibold font-mono">Add Component</button>
          </div>
        </form>

        <ComponentOrderList pageId={pageId} components={editableComponents.map((component) => ({ id: component.id, name: component.name }))}>
          {editableComponents.map(
            (c) => (
              <article key={c.id} className="overflow-hidden border border-[var(--line)] bg-[var(--surface-raised)] text-sm">
                <header className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--surface)] py-3 pl-12 pr-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-mono font-semibold text-[var(--fg)]">{c.name}</h3>
                      <span className="border border-[var(--line)] bg-[var(--bg)] px-2 py-0.5 text-[10px] text-[var(--fg-dim)]">{c.groupName}</span>
                      {c.isThirdParty && <span className="bg-[var(--blue-soft)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--blue)]">Monitored template</span>}
                    </div>
                    <p className="mt-1 text-xs text-[var(--fg-dim)]">Service details save with the page-level “Save all settings” button.</p>
                  </div>
                  <form action={deleteComponent.bind(null, pageId, c.id)}>
                    <PlatformSubmitButton confirmMessage={`Delete ${c.name}?`} pendingLabel="Deleting…" className="shrink-0 border border-[var(--red)]/30 px-3 py-1.5 text-xs font-semibold text-[var(--red)] transition-colors hover:bg-[var(--red-soft)]">
                      Delete
                    </PlatformSubmitButton>
                  </form>
                </header>

                <div className="grid gap-0 lg:grid-cols-[minmax(18rem,0.9fr)_minmax(24rem,1.35fr)]">
                  <PlatformActionForm
                    action={updateComponentStatus.bind(null, pageId, c.id)}
                    successMessage="Status updated"
                    className="grid content-start gap-3 border-b border-[var(--line)] p-4 lg:border-b-0 lg:border-r"
                  >
                    <div>
                      <p className="font-mono text-xs font-semibold uppercase tracking-wide text-[var(--fg-dim)]">Public status</p>
                      <p className="mt-1 text-xs text-[var(--fg-dim)]">Publish a status change and an optional customer-facing note.</p>
                    </div>
                    <FluentSelect aria-label={`Public status for ${c.name}`} name="status" defaultValue={c.status} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none">
                      {COMPONENT_STATUSES.map((s) => (
                        <option key={s} value={s}>{COMPONENT_STATUS_LABEL[s]}</option>
                      ))}
                    </FluentSelect>
                    <FluentTextarea name="note" rows={3} maxLength={1000} placeholder="Optional public note about this status change" aria-label={`Status note for ${c.name}`} className="!w-full !bg-[var(--bg)]" />
                    <PlatformSubmitButton pendingLabel="Updating…" className="w-fit border border-[var(--line-bright)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--fg)]">
                      Update status
                    </PlatformSubmitButton>
                  </PlatformActionForm>

                  <section className="grid content-start gap-4 p-4">
                    <input type="hidden" form="page-settings-form" name="componentId" value={c.id} />
                    <div>
                      <p className="font-mono text-xs font-semibold uppercase tracking-wide text-[var(--fg-dim)]">Service details</p>
                      <p className="mt-1 text-xs text-[var(--fg-dim)]">Edit the label, description, grouping, and public visibility.</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs text-[var(--fg-soft)]">
                        Name
                        <input form="page-settings-form" name={`component.${c.id}.name`} defaultValue={c.name} maxLength={120} required className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none" />
                      </label>
                      <label className="text-xs text-[var(--fg-soft)]">
                        Group
                        <FluentSelect aria-label={`Group for ${c.name}`} form="page-settings-form" name={`component.${c.id}.groupId`} defaultValue={c.groupId?.toString() ?? ""} className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)]">
                          <option value="">No group</option>
                          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </FluentSelect>
                      </label>
                      <label className="text-xs text-[var(--fg-soft)] sm:col-span-2">
                        Description
                        <input form="page-settings-form" name={`component.${c.id}.description`} defaultValue={c.description} maxLength={1000} placeholder="Optional public description" className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)] focus:outline-none" />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-[var(--line)] pt-3">
                      <label className="flex items-center gap-2 text-sm text-[var(--fg-soft)]"><input form="page-settings-form" type="checkbox" name={`component.${c.id}.visible`} defaultChecked={c.visible} /> Visible publicly</label>
                      <label className="flex items-center gap-2 text-sm text-[var(--fg-soft)]"><input form="page-settings-form" type="checkbox" name={`component.${c.id}.showUptime`} defaultChecked={c.showUptime} /> Show uptime history</label>
                    </div>
                  </section>
                </div>

                <footer className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-xs text-[var(--fg-dim)]">
                  <span className="font-semibold">Automation webhook</span>
                  <AutomationTokenManager componentId={c.id} label={secretLabel(c.automationTokenPrefix, c.automationTokenLastFour)} />
                  <HelpTip text="POST a status value to this URL to update the component automatically from your own monitoring." />
                </footer>
              </article>
            )
          )}
        </ComponentOrderList>
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
            <FluentSelect aria-label="Access group" name="groupId" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none">
              <option value="">No group</option>
              {accessGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </FluentSelect>
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
          <PlatformSubmitButton
            pendingLabel="Deleting…"
            confirmMessage={`Delete ${page.name}? This page will become unavailable to everyone. An administrator can restore it from Deleted Pages.`}
            className="border border-[var(--red)]/40 px-3 py-1.5 text-sm font-semibold text-[var(--red)] hover:bg-[var(--red-soft)]"
          >
            Delete this page
          </PlatformSubmitButton>
          <HelpTip text="Soft-deletes this page and makes it inaccessible. Administrators can restore it from Deleted Pages." />
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

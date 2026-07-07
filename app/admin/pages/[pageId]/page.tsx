import { notFound } from "next/navigation";
import { requireSession } from "@/lib/require-session";
import { prisma } from "@/lib/db";
import { COMPONENT_STATUSES, COMPONENT_STATUS_LABEL } from "@/lib/status";
import { updatePageSettings, deletePage } from "../actions";
import { createGroup, deleteGroup, createComponent, updateComponentStatus, updateComponentDetails, deleteComponent } from "./components-actions";
import { createAccessGroup, deleteAccessGroup, createAccessUser, deleteAccessUser } from "./access-actions";

export default async function PageDetail({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const { org } = await requireSession();
  const page = await prisma.page.findUnique({ where: { id: pageId } });
  if (!page || page.orgId !== org.id) notFound();

  const groups = await prisma.componentGroup.findMany({
    where: { pageId },
    orderBy: { order: "asc" },
    include: { components: { orderBy: { order: "asc" } } },
  });
  const ungrouped = await prisma.component.findMany({ where: { pageId, groupId: null }, orderBy: { order: "asc" } });
  const providers = await prisma.thirdPartyProvider.findMany({ orderBy: { name: "asc" } });
  const allComponents = [...groups.flatMap((g) => g.components), ...ungrouped];
  const accessGroups = page.type === "AUDIENCE" ? await prisma.pageAccessGroup.findMany({ where: { pageId } }) : [];
  const accessUsers = page.type === "AUDIENCE" ? await prisma.pageAccessUser.findMany({ where: { pageId }, include: { group: true } }) : [];
  const boundUpdatePage = updatePageSettings.bind(null, pageId);
  const boundDeletePage = deletePage.bind(null, pageId);
  const boundCreateGroup = createGroup.bind(null, pageId);
  const boundCreateComponent = createComponent.bind(null, pageId);
  const boundCreateAccessGroup = createAccessGroup.bind(null, pageId);
  const boundCreateAccessUser = createAccessUser.bind(null, pageId);

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{page.name}</h1>
        <a href={`/${page.slug}`} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline">
          View public page →
        </a>
      </div>

      <section className="bg-white border rounded-lg p-5">
        <h2 className="font-semibold mb-4">Branding & Settings</h2>
        <form action={boundUpdatePage} className="grid sm:grid-cols-2 gap-4">
          <Field label="Page name">
            <input name="name" defaultValue={page.name} className="w-full border rounded-md px-3 py-2 text-sm" />
          </Field>
          <Field label="Headline">
            <input name="headline" defaultValue={page.headline} className="w-full border rounded-md px-3 py-2 text-sm" />
          </Field>
          <Field label="About text" full>
            <textarea name="aboutText" defaultValue={page.aboutText} className="w-full border rounded-md px-3 py-2 text-sm" rows={2} />
          </Field>
          <Field label="Support URL">
            <input name="supportUrl" defaultValue={page.supportUrl ?? ""} className="w-full border rounded-md px-3 py-2 text-sm" />
          </Field>
          <Field label="Brand color">
            <input name="brandColor" type="color" defaultValue={page.brandColor} className="w-16 h-9 border rounded-md" />
          </Field>
          <Field label="Logo URL">
            <input name="logoUrl" defaultValue={page.logoUrl ?? ""} className="w-full border rounded-md px-3 py-2 text-sm" />
          </Field>
          <Field label="Favicon URL">
            <input name="faviconUrl" defaultValue={page.faviconUrl ?? ""} className="w-full border rounded-md px-3 py-2 text-sm" />
          </Field>
          <Field label="Custom domain">
            <input name="customDomain" defaultValue={page.customDomain ?? ""} placeholder="status.yourcompany.com" className="w-full border rounded-md px-3 py-2 text-sm" />
          </Field>
          <Field label="Timezone">
            <input name="timezone" defaultValue={page.timezone} className="w-full border rounded-md px-3 py-2 text-sm" />
          </Field>
          <Field label="Language">
            <input name="language" defaultValue={page.language} className="w-full border rounded-md px-3 py-2 text-sm" />
          </Field>
          {page.type === "PRIVATE" && (
            <Field label="New password (leave blank to keep)">
              <input name="password" type="password" className="w-full border rounded-md px-3 py-2 text-sm" />
            </Field>
          )}
          <Field label="Custom CSS" full>
            <textarea name="customCss" defaultValue={page.customCss ?? ""} className="w-full border rounded-md px-3 py-2 text-sm font-mono" rows={3} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="removeBranding" defaultChecked={page.removeBranding} /> Remove &quot;Powered by&quot; branding
          </label>
          <div className="sm:col-span-2">
            <button className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium">Save Settings</button>
          </div>
        </form>
      </section>

      <section className="bg-white border rounded-lg p-5">
        <h2 className="font-semibold mb-4">Component Groups</h2>
        <form action={boundCreateGroup} className="flex gap-2 mb-4">
          <input name="name" placeholder="New group name" className="flex-1 border rounded-md px-3 py-2 text-sm" required />
          <button className="bg-gray-800 text-white rounded-md px-3 py-2 text-sm">Add Group</button>
        </form>
        <div className="space-y-2">
          {groups.map((g) => (
            <div key={g.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
              <span>{g.name} ({g.components.length})</span>
              <form action={deleteGroup.bind(null, pageId, g.id)}>
                <button className="text-red-500 hover:underline text-xs">Delete</button>
              </form>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border rounded-lg p-5">
        <h2 className="font-semibold mb-4">Components</h2>
        <form action={boundCreateComponent} className="grid sm:grid-cols-2 gap-3 mb-6 border-b pb-6">
          <input name="name" placeholder="Component name" className="border rounded-md px-3 py-2 text-sm" />
          <select name="groupId" className="border rounded-md px-3 py-2 text-sm">
            <option value="">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <input name="description" placeholder="Description (optional)" className="border rounded-md px-3 py-2 text-sm sm:col-span-2" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isThirdParty" /> Mirror a third-party provider
          </label>
          <select name="thirdPartyProvider" className="border rounded-md px-3 py-2 text-sm">
            <option value="">Select provider…</option>
            {providers.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name} ({p.category})
              </option>
            ))}
          </select>
          <div className="sm:col-span-2">
            <button className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium">Add Component</button>
          </div>
        </form>

        <div className="space-y-2">
          {[...groups.flatMap((g) => g.components.map((c) => ({ ...c, groupName: g.name }))), ...ungrouped.map((c) => ({ ...c, groupName: "—" }))].map(
            (c) => (
              <div key={c.id} className="border rounded-md p-3 text-sm space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-gray-400 ml-2">{c.groupName}</span>
                    {c.isThirdParty && <span className="text-xs bg-purple-100 text-purple-700 rounded px-1.5 py-0.5 ml-2">third-party</span>}
                  </div>
                  <form action={deleteComponent.bind(null, pageId, c.id)}>
                    <button className="text-red-500 hover:underline text-xs">Delete</button>
                  </form>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <form action={updateComponentStatus.bind(null, pageId, c.id)} className="flex items-center gap-2">
                    <select name="status" defaultValue={c.status} className="border rounded-md px-2 py-1 text-xs">
                      {COMPONENT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {COMPONENT_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                    <button className="bg-gray-800 text-white rounded-md px-2 py-1 text-xs">Update Status</button>
                  </form>
                  <span className="text-xs text-gray-400">
                    Automation webhook: <code className="bg-gray-100 px-1 rounded">/api/v1/webhook-component/{c.automationToken}</code>
                  </span>
                </div>
                <form action={updateComponentDetails.bind(null, pageId, c.id)} className="flex flex-wrap items-end gap-2 pt-2 border-t">
                  <input name="name" defaultValue={c.name} className="border rounded-md px-2 py-1 text-xs w-40" />
                  <input name="description" defaultValue={c.description} placeholder="Description" className="border rounded-md px-2 py-1 text-xs flex-1 min-w-[10rem]" />
                  <input name="order" type="number" defaultValue={c.order} className="border rounded-md px-2 py-1 text-xs w-16" />
                  <select name="groupId" defaultValue={c.groupId ?? ""} className="border rounded-md px-2 py-1 text-xs">
                    <option value="">No group</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" name="visible" defaultChecked={c.visible} /> Visible
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" name="showUptime" defaultChecked={c.showUptime} /> Show uptime
                  </label>
                  <button className="bg-gray-200 rounded-md px-2 py-1 text-xs">Save Details</button>
                </form>
              </div>
            )
          )}
        </div>
      </section>

      {page.type === "AUDIENCE" && (
        <section className="bg-white border rounded-lg p-5">
          <h2 className="font-semibold mb-4">Audience Access</h2>
          <p className="text-xs text-gray-500 mb-4">
            Each visitor logs in and sees only the components assigned to their user or group. Assign components below.
          </p>

          <h3 className="text-sm font-semibold mb-2">Access Groups</h3>
          <form action={boundCreateAccessGroup} className="grid sm:grid-cols-2 gap-3 mb-4 border-b pb-4">
            <input name="name" placeholder="Group name" className="border rounded-md px-3 py-2 text-sm" required />
            <div className="flex flex-wrap gap-2 border rounded-md p-2 text-xs">
              {allComponents.map((c) => (
                <label key={c.id} className="flex items-center gap-1">
                  <input type="checkbox" name="componentIds" value={c.id} /> {c.name}
                </label>
              ))}
            </div>
            <button className="bg-gray-800 text-white rounded-md px-3 py-2 text-sm sm:col-span-2 w-fit">Add Group</button>
          </form>
          <div className="space-y-1 mb-6">
            {accessGroups.map((g) => (
              <div key={g.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
                <span>{g.name}</span>
                <form action={deleteAccessGroup.bind(null, pageId, g.id)}>
                  <button className="text-red-500 hover:underline text-xs">Delete</button>
                </form>
              </div>
            ))}
          </div>

          <h3 className="text-sm font-semibold mb-2">Access Users</h3>
          <form action={boundCreateAccessUser} className="grid sm:grid-cols-2 gap-3 mb-4 border-b pb-4">
            <input name="email" type="email" placeholder="Customer email" className="border rounded-md px-3 py-2 text-sm" required />
            <input name="password" type="password" placeholder="Password" className="border rounded-md px-3 py-2 text-sm" required />
            <select name="groupId" className="border rounded-md px-3 py-2 text-sm">
              <option value="">No group</option>
              {accessGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2 border rounded-md p-2 text-xs">
              {allComponents.map((c) => (
                <label key={c.id} className="flex items-center gap-1">
                  <input type="checkbox" name="componentIds" value={c.id} /> {c.name}
                </label>
              ))}
            </div>
            <button className="bg-blue-600 text-white rounded-md px-3 py-2 text-sm sm:col-span-2 w-fit">Add User</button>
          </form>
          <div className="space-y-1">
            {accessUsers.map((u) => (
              <div key={u.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
                <span>
                  {u.email} {u.group && <span className="text-xs text-gray-400 ml-2">{u.group.name}</span>}
                </span>
                <form action={deleteAccessUser.bind(null, pageId, u.id)}>
                  <button className="text-red-500 hover:underline text-xs">Delete</button>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bg-white border rounded-lg p-5 border-red-200">
        <h2 className="font-semibold mb-2 text-red-700">Danger Zone</h2>
        <form action={boundDeletePage}>
          <button className="text-red-600 border border-red-300 rounded-md px-3 py-1.5 text-sm hover:bg-red-50">Delete this page</button>
        </form>
      </section>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block text-sm ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-xs text-gray-500 block mb-1">{label}</span>
      {children}
    </label>
  );
}

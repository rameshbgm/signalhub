import { requirePlatformCapability } from "@/lib/admin-guard";
import { collections } from "@/lib/db";
import { hasPlatformCapability } from "@/lib/platform-policy";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { ScimTokenManager } from "@/components/platform/ScimTokenManager";
import {
  createIdentityConnection,
  setIdentityConnectionEnabled,
  testIdentityConnection,
} from "./actions";

export default async function IdentityPage() {
  const session = await requirePlatformCapability("identity.read");
  const canManage = hasPlatformCapability(session.role, "identity.manage");
  const [connections, organizations] = await Promise.all([
    collections.identityConnections().find({}).sort({ createdAt: -1 }).toArray(),
    collections.organizations().find({ status: "ACTIVE" }).sort({ name: 1 }).toArray(),
  ]);
  const orgNames = new Map(organizations.map((org) => [org._id.toHexString(), org.name]));

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="font-mono text-xl font-semibold">Enterprise identity</h1>
        <p className="mt-1 text-sm text-[var(--fg-soft)]">
          Platform-managed OIDC and SAML connections with SCIM provisioning into fixed roles and page scopes.
        </p>
      </div>

      {canManage && (
        <section className="border border-[var(--line)] bg-[var(--surface)] p-5">
          <h2 className="font-mono text-sm font-semibold">Add identity connection</h2>
          <p className="mt-1 text-xs text-[var(--fg-dim)]">
            Provider credentials are encrypted. For SAML, configure the generated metadata URL at your IdP.
          </p>
          <PlatformActionForm
            action={createIdentityConnection}
            successMessage="Identity connection created"
            className="mt-4 grid gap-3 sm:grid-cols-2"
          >
            <input name="name" placeholder="Connection name" required className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
            <input name="slug" placeholder="Stable slug" required pattern="[a-z0-9-]+" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
            <select name="type" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm">
              <option value="OIDC">OpenID Connect</option>
              <option value="SAML">SAML 2.0</option>
            </select>
            <select name="audience" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm">
              <option value="ORGANIZATION">Organization</option>
              <option value="PLATFORM">Platform administrators</option>
            </select>
            <select name="orgId" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm">
              <option value="">No organization (platform audience)</option>
              {organizations.map((org) => <option key={org._id.toHexString()} value={org._id.toHexString()}>{org.name}</option>)}
            </select>
            <select name="defaultRole" defaultValue="VIEWER" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm">
              <option value="VIEWER">Default: Viewer</option>
              <option value="RESPONDER">Default: Responder</option>
              <option value="INCIDENT_MANAGER">Default: Incident manager</option>
              <option value="ADMIN">Default: Admin</option>
            </select>
            <input name="issuer" placeholder="OIDC issuer or SAML SP entity ID" required className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
            <input name="clientId" placeholder="OIDC client ID (OIDC only)" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
            <input name="clientSecret" type="password" placeholder="OIDC client secret (OIDC only)" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
            <input name="entryPoint" placeholder="SAML IdP SSO URL (SAML only)" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
            <textarea name="idpCertificate" placeholder="SAML IdP signing certificate (SAML only)" rows={3} className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-mono text-xs sm:col-span-2" />
            <textarea name="privateKey" placeholder="SAML SP private key for signed requests/encrypted assertions (optional)" rows={3} className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-mono text-xs" />
            <textarea name="spCertificate" placeholder="SAML SP public certificate matching the private key (optional)" rows={3} className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-mono text-xs" />
            <input name="acceptedAcrValues" placeholder="Accepted acr values, comma-separated" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
            <input name="acceptedAmrValues" placeholder="Accepted amr values, comma-separated" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
            <textarea
              name="roleMappings"
              defaultValue="[]"
              rows={3}
              aria-label="Role mappings JSON"
              className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-mono text-xs sm:col-span-2"
            />
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="allowJitProvisioning" /> Allow organization JIT provisioning</label>
            <input type="hidden" name="scopes" value="openid email profile groups" />
            <button className="bg-[var(--cyan)] px-4 py-2 text-sm font-semibold text-[var(--on-cyan)]">Create connection</button>
          </PlatformActionForm>
        </section>
      )}

      <section className="space-y-3">
        {connections.map((connection) => (
          <article key={connection._id.toHexString()} className="border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-mono text-sm font-semibold">{connection.name}</h2>
                  <span className="bg-[var(--bg)] px-1.5 py-0.5 text-[10px]">{connection.type}</span>
                  <span className={connection.enabled ? "text-xs text-[var(--green)]" : "text-xs text-[var(--red)]"}>
                    {connection.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--fg-dim)]">
                  {connection.audience === "PLATFORM" ? "Platform administrators" : orgNames.get(connection.orgId?.toHexString() ?? "") ?? "Unknown organization"}
                  {" · "}{connection.slug}
                </p>
                <code className="mt-2 block break-all text-[10px] text-[var(--fg-soft)]">
                  {connection.type === "OIDC"
                    ? `/api/auth/oidc/${connection.slug}/callback`
                    : `/api/auth/saml/${connection.slug}/metadata`}
                </code>
                {connection.lastTestedAt && (
                  <p className={`mt-1 text-xs ${connection.lastTestOk ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                    Last test: {connection.lastTestOk ? "passed" : connection.lastError ?? "failed"}
                  </p>
                )}
              </div>
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <PlatformActionForm action={testIdentityConnection.bind(null, connection._id.toHexString())} successMessage="Connection test passed">
                    <button className="border border-[var(--line)] px-2.5 py-1 text-xs">Test</button>
                  </PlatformActionForm>
                  <PlatformActionForm action={setIdentityConnectionEnabled.bind(null, connection._id.toHexString())} successMessage={connection.enabled ? "Connection disabled" : "Connection enabled"}>
                    <input type="hidden" name="enabled" value={String(!connection.enabled)} />
                    <button className="border border-[var(--line)] px-2.5 py-1 text-xs">{connection.enabled ? "Disable" : "Enable"}</button>
                  </PlatformActionForm>
                </div>
              )}
            </div>
            {canManage && connection.audience === "ORGANIZATION" && (
              <div className="mt-3 border-t border-[var(--line)] pt-3">
                <p className="mb-2 text-xs text-[var(--fg-dim)]">
                  SCIM base URL: <code>/api/scim/v2/{connection.slug}</code>
                </p>
                <ScimTokenManager connectionId={connection._id.toHexString()} />
              </div>
            )}
          </article>
        ))}
        {!connections.length && <p className="border border-[var(--line)] p-4 text-sm text-[var(--fg-dim)]">No identity connections configured.</p>}
      </section>
    </div>
  );
}

import { requirePlatformPageCapability } from "@/lib/platform-page-guard";
import { Select } from "@/components/ui/select";
import { database } from "@/lib/postgres/client";
import { hasPlatformCapability } from "@/lib/platform-policy";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { ScimTokenManager } from "@/components/platform/ScimTokenManager";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createIdentityConnection,
  setIdentityConnectionEnabled,
  testIdentityConnection,
} from "./actions";

export default async function IdentityPage() {
  const session = await requirePlatformPageCapability("identity.read");
  const canManage = hasPlatformCapability(session.role, "identity.manage");
  const [connections, organizations] = await Promise.all([
    database.selectFrom("identityConnections").selectAll().where("audience", "=", "ORGANIZATION").orderBy("createdAt", "desc").execute(),
    database.selectFrom("organizations").selectAll().where("status", "=", "ACTIVE").orderBy("name", "asc").execute(),
  ]);
  const orgNames = new Map(organizations.map((org) => [org.id, org.name]));

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="font-mono text-xl font-semibold">Enterprise identity</h1>
        <p className="mt-1 text-sm text-[var(--fg-soft)]">
          Organization OIDC and SAML connections with SCIM provisioning into fixed roles and page scopes.
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
            <Input name="name" placeholder="Connection name" required />
            <Input name="slug" placeholder="Stable slug" required pattern="[a-z0-9-]+" />
            <Select aria-label="Connection type" name="type" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm">
              <option value="OIDC">OpenID Connect</option>
              <option value="SAML">SAML 2.0</option>
            </Select>
            <Select aria-label="Organization" name="orgId" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm">
              <option value="">Choose organization</option>
              {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </Select>
            <Select aria-label="Default role" name="defaultRole" defaultValue="VIEWER" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm">
              <option value="VIEWER">Default: Viewer</option>
              <option value="RESPONDER">Default: Responder</option>
              <option value="INCIDENT_MANAGER">Default: Incident manager</option>
              <option value="ADMIN">Default: Admin</option>
            </Select>
            <Input name="issuer" placeholder="OIDC issuer or SAML SP entity ID" required />
            <Input name="clientId" placeholder="OIDC client ID (OIDC only)" />
            <Input name="clientSecret" type="password" placeholder="OIDC client secret (OIDC only)" />
            <Input name="entryPoint" placeholder="SAML IdP SSO URL (SAML only)" />
            <Textarea name="idpCertificate" placeholder="SAML IdP signing certificate (SAML only)" rows={3} className="font-mono text-xs sm:col-span-2" />
            <Textarea name="privateKey" placeholder="SAML SP private key for signed requests/encrypted assertions (optional)" rows={3} className="font-mono text-xs" />
            <Textarea name="spCertificate" placeholder="SAML SP public certificate matching the private key (optional)" rows={3} className="font-mono text-xs" />
            <Input name="acceptedAcrValues" placeholder="Accepted acr values, comma-separated" />
            <Input name="acceptedAmrValues" placeholder="Accepted amr values, comma-separated" />
            <Textarea
              name="roleMappings"
              defaultValue="[]"
              rows={3}
              aria-label="Role mappings JSON"
              className="font-mono text-xs sm:col-span-2"
            />
            <label className="flex items-center gap-2 text-xs"><Checkbox name="allowJitProvisioning" /> Allow organization JIT provisioning</label>
            <Input type="hidden" name="scopes" value="openid email profile groups" />
            <Button type="submit">Create connection</Button>
          </PlatformActionForm>
        </section>
      )}

      <section className="space-y-3">
        {connections.map((connection) => (
          <article key={connection.id} className="border border-[var(--line)] bg-[var(--surface)] p-4">
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
                  {orgNames.get(connection.orgId ?? "") ?? "Unknown organization"}
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
                  <PlatformActionForm action={testIdentityConnection.bind(null, connection.id)} successMessage="Connection test passed">
                    <Button type="submit" variant="outline" size="sm">Test</Button>
                  </PlatformActionForm>
                  <PlatformActionForm action={setIdentityConnectionEnabled.bind(null, connection.id)} successMessage={connection.enabled ? "Connection disabled" : "Connection enabled"}>
                    <Input type="hidden" name="enabled" value={String(!connection.enabled)} />
                    <Button type="submit" variant="outline" size="sm">{connection.enabled ? "Disable" : "Enable"}</Button>
                  </PlatformActionForm>
                </div>
              )}
            </div>
            {canManage && (
              <div className="mt-3 border-t border-[var(--line)] pt-3">
                <p className="mb-2 text-xs text-[var(--fg-dim)]">
                  SCIM base URL: <code>/api/scim/v2/{connection.slug}</code>
                </p>
                <ScimTokenManager connectionId={connection.id} />
              </div>
            )}
          </article>
        ))}
        {!connections.length && <p className="border border-[var(--line)] p-4 text-sm text-[var(--fg-dim)]">No identity connections configured.</p>}
      </section>
    </div>
  );
}

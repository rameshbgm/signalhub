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
import { Fingerprint } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
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
    <div className="space-y-8">
      <PageHeader title="Enterprise identity" icon={Fingerprint} hue="violet" description="Organization OIDC and SAML connections with SCIM provisioning into fixed roles and page scopes." />

      {canManage && (
        <Card>
          <CardHeader><CardTitle>Add identity connection</CardTitle><CardDescription>Provider credentials are encrypted. For SAML, configure the generated metadata URL at your IdP.</CardDescription></CardHeader>
          <CardContent>
          <PlatformActionForm
            action={createIdentityConnection}
            successMessage="Identity connection created"
            className="grid gap-4 sm:grid-cols-2"
          >
            <Field label="Connection name" htmlFor="identity-name" required><Input id="identity-name" name="name" required /></Field>
            <Field label="Stable slug" htmlFor="identity-slug" required><Input id="identity-slug" name="slug" required pattern="[a-z0-9-]+" /></Field>
            <Field label="Connection type" htmlFor="identity-type"><Select id="identity-type" name="type">
              <option value="OIDC">OpenID Connect</option>
              <option value="SAML">SAML 2.0</option>
            </Select></Field>
            <Field label="Organization" htmlFor="identity-org"><Select id="identity-org" name="orgId">
              <option value="">Choose organization</option>
              {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </Select></Field>
            <Field label="Default role" htmlFor="identity-role"><Select id="identity-role" name="defaultRole" defaultValue="VIEWER">
              <option value="VIEWER">Default: Viewer</option>
              <option value="RESPONDER">Default: Responder</option>
              <option value="INCIDENT_MANAGER">Default: Incident manager</option>
              <option value="ADMIN">Default: Admin</option>
            </Select></Field>
            <Field label="OIDC issuer or SAML SP entity ID" htmlFor="identity-issuer" required><Input id="identity-issuer" name="issuer" required /></Field>
            <Field label="OIDC client ID" htmlFor="identity-client-id"><Input id="identity-client-id" name="clientId" /></Field>
            <Field label="OIDC client secret" htmlFor="identity-client-secret"><Input id="identity-client-secret" name="clientSecret" type="password" /></Field>
            <Field label="SAML IdP SSO URL" htmlFor="identity-entry"><Input id="identity-entry" name="entryPoint" /></Field>
            <Field label="SAML IdP signing certificate" htmlFor="identity-idp-cert" className="sm:col-span-2"><Textarea id="identity-idp-cert" name="idpCertificate" rows={3} className="font-mono text-xs" /></Field>
            <Field label="SAML SP private key" htmlFor="identity-private-key" hint="Optional. Used for signed requests or encrypted assertions."><Textarea id="identity-private-key" name="privateKey" rows={3} className="font-mono text-xs" /></Field>
            <Field label="SAML SP public certificate" htmlFor="identity-sp-cert" hint="Optional. Must match the private key."><Textarea id="identity-sp-cert" name="spCertificate" rows={3} className="font-mono text-xs" /></Field>
            <Field label="Accepted acr values" htmlFor="identity-acr" hint="Separate values with commas."><Input id="identity-acr" name="acceptedAcrValues" /></Field>
            <Field label="Accepted amr values" htmlFor="identity-amr" hint="Separate values with commas."><Input id="identity-amr" name="acceptedAmrValues" /></Field>
            <Field label="Role mappings JSON" htmlFor="identity-role-mappings" className="sm:col-span-2"><Textarea id="identity-role-mappings"
              name="roleMappings"
              defaultValue="[]"
              rows={3}
              className="font-mono text-xs"
            /></Field>
            <label className="flex items-center gap-2 text-sm text-ink-soft sm:col-span-2"><Checkbox name="allowJitProvisioning" /> Allow organization JIT provisioning</label>
            <Input type="hidden" name="scopes" value="openid email profile groups" />
            <div className="flex justify-end sm:col-span-2"><Button type="submit">Create connection</Button></div>
          </PlatformActionForm>
          </CardContent>
        </Card>
      )}

      <section className="space-y-3" aria-label="Identity connections">
        {connections.map((connection) => (
          <Card key={connection.id}>
          <CardContent>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-ink">{connection.name}</h2>
                  <Badge>{connection.type}</Badge>
                  <StatusBadge tone={connection.enabled ? "ok" : "neutral"}>{connection.enabled ? "Enabled" : "Disabled"}</StatusBadge>
                </div>
                <p className="mt-1 text-xs text-ink-dim">
                  {orgNames.get(connection.orgId ?? "") ?? "Unknown organization"}
                  {" · "}{connection.slug}
                </p>
                <code className="mt-2 block break-all font-mono text-xs text-ink-soft">
                  {connection.type === "OIDC"
                    ? `/api/auth/oidc/${connection.slug}/callback`
                    : `/api/auth/saml/${connection.slug}/metadata`}
                </code>
                {connection.lastTestedAt && (
                  <p className={`mt-1 text-xs ${connection.lastTestOk ? "text-ok-fg" : "text-danger-fg"}`}>
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
              <div className="mt-4 border-t border-line pt-4">
                <p className="mb-2 text-xs text-ink-dim">
                  SCIM base URL: <code>/api/scim/v2/{connection.slug}</code>
                </p>
                <ScimTokenManager connectionId={connection.id} />
              </div>
            )}
          </CardContent>
          </Card>
        ))}
        {!connections.length && <EmptyState icon={Fingerprint} hue="violet" title="No identity connections configured" description="Add an OIDC or SAML connection to enable enterprise sign-in for an organization." />}
      </section>
    </div>
  );
}

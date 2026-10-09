"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Activity, Check, CheckCircle2, Database, Download, KeyRound, Lock, UserRound, XCircle, AlertTriangle } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

type Mode = "db" | "admin";
type Step = "unlock" | "database" | "applying" | "admin" | "done";
type Check = { id: string; status: "pass" | "warn" | "fail"; message: string };
type ConnectionMethod = "fields" | "url" | "bundled";
type ApiError = { error?: { code?: string; message?: string; checks?: Check[]; fields?: Record<string, string> } };

const STEPS = [
  { id: "unlock", label: "Unlock", icon: Lock },
  { id: "database", label: "Database", icon: Database },
  { id: "admin", label: "Administrator", icon: UserRound },
  { id: "done", label: "Done", icon: Check },
] as const;

async function post(url: string, body: unknown) {
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }, 30_000);
  const json = (await response.json().catch(() => ({}))) as ApiError & Record<string, unknown>;
  return { response, json };
}

function slugify(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

export function SetupWizard({
  initialMode,
  initiallyUnlocked,
  bundledDatabase,
  defaultAppUrl,
  passwordMinimum,
}: {
  initialMode: Mode | "complete";
  initiallyUnlocked: boolean;
  bundledDatabase: boolean;
  defaultAppUrl: string;
  passwordMinimum: number;
}) {
  const [step, setStep] = useState<Step>(
    initialMode === "complete" ? "done" : initiallyUnlocked ? (initialMode === "db" ? "database" : "admin") : "unlock"
  );
  const [mode, setMode] = useState<Mode>(initialMode === "complete" ? "admin" : initialMode);
  const [backupAvailable, setBackupAvailable] = useState(false);
  const [databaseChangeable, setDatabaseChangeable] = useState(false);
  const [applyingMessage, setApplyingMessage] = useState("");
  const [applyError, setApplyError] = useState<string | null>(null);
  const [createdUser, setCreatedUser] = useState("");

  const visibleSteps = STEPS.filter((item) => item.id !== "database" || initialMode === "db" || databaseChangeable);
  const activeIndex = visibleSteps.findIndex((item) => item.id === (step === "applying" ? (mode === "db" ? "database" : "admin") : step));

  /** Polls while the supervisor reloads; resolves once the server reports `target`. */
  async function waitForMode(target: Mode | null, message: string) {
    setApplyingMessage(message);
    setApplyError(null);
    setStep("applying");
    const deadline = Date.now() + 3 * 60_000;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    while (Date.now() < deadline) {
      try {
        const response = await fetchWithTimeout("/api/setup/status", { cache: "no-store" }, 5_000);
        if (response.ok) {
          const status = await response.json() as { mode: Mode | null; backupAvailable: boolean; databaseChangeable: boolean };
          if (status.mode === target) {
            setBackupAvailable(status.backupAvailable);
            setDatabaseChangeable(status.databaseChangeable);
            if (target) setMode(target);
            return true;
          }
        }
      } catch {
        // The server is restarting; keep polling.
      }
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
    setApplyError("The server did not come back. Check its logs (docker compose logs signalhub, or the terminal running SignalHub) and reload this page.");
    return false;
  }

  useEffect(() => {
    if (initialMode === "admin" && initiallyUnlocked) {
      fetchWithTimeout("/api/setup/status", { cache: "no-store" })
        .then((response) => response.json())
        .then((status: { backupAvailable?: boolean; databaseChangeable?: boolean }) => {
          setBackupAvailable(Boolean(status.backupAvailable));
          setDatabaseChangeable(Boolean(status.databaseChangeable));
        })
        .catch(() => undefined);
    }
  }, [initialMode, initiallyUnlocked]);

  return (
    <div className="min-h-screen bg-wash px-4 py-8 text-ink sm:px-8">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex items-center gap-2.5 text-base font-bold tracking-tight">
          <span aria-hidden="true" className="inline-flex items-center text-primary"><Activity size={18} strokeWidth={2.25} /></span>
          SignalHub setup
        </div>

        <ol className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-3" aria-label="Setup progress">
          {visibleSteps.map((item, index) => {
            const done = index < activeIndex;
            const current = index === activeIndex;
            const Icon = done ? Check : item.icon;
            return (
              <li key={item.id} className="flex items-center gap-2" aria-current={current ? "step" : undefined}>
                <span className={cn(
                  "inline-flex size-7 items-center justify-center rounded-full border text-xs",
                  done && "border-ok/30 bg-ok-bg text-ok-fg",
                  current && "border-primary bg-primary text-on-primary",
                  !done && !current && "border-line-strong bg-surface text-ink-dim",
                )}>
                  <Icon aria-hidden size={14} />
                </span>
                <span className={cn("text-sm", current ? "font-semibold text-ink" : "text-ink-soft")}>{item.label}</span>
                {index < visibleSteps.length - 1 && <span aria-hidden="true" className="mx-1 h-px w-6 bg-line-strong sm:w-10" />}
              </li>
            );
          })}
        </ol>

        <main className="mt-6 animate-rise rounded-card border border-line bg-surface p-6 shadow-card sm:p-8">
          {step === "unlock" && <UnlockStep onUnlocked={() => setStep(mode === "db" ? "database" : "admin")} />}
          {step === "database" && (
            <DatabaseStep
              bundledDatabase={bundledDatabase}
              defaultAppUrl={defaultAppUrl}
              onSaved={async () => {
                if (await waitForMode("admin", "Saving the configuration and installing the database schema…")) setStep("admin");
              }}
            />
          )}
          {step === "applying" && (
            <div className="py-10 text-center">
              {applyError ? (
                <Alert tone="danger" title="Setup did not finish">{applyError}</Alert>
              ) : (
                <>
                  <span aria-hidden="true" className="mx-auto block size-8 animate-spin rounded-full border-[3px] border-primary border-r-transparent" />
                  <p className="mt-5 font-semibold" role="status">{applyingMessage}</p>
                  <p className="mt-1 text-sm text-ink-soft">This usually takes a few seconds. Keep this page open.</p>
                </>
              )}
            </div>
          )}
          {step === "admin" && (
            <AdminStep
              passwordMinimum={passwordMinimum}
              backupAvailable={backupAvailable}
              databaseChangeable={databaseChangeable}
              onChangeDatabase={async () => {
                if (await waitForMode("db", "Forgetting the saved connection…")) setStep("database");
              }}
              onCreated={async (username) => {
                setCreatedUser(username);
                if (await waitForMode(null, "Creating your account and starting SignalHub…")) setStep("done");
              }}
            />
          )}
          {step === "done" && <DoneStep username={createdUser} />}
        </main>
      </div>
    </div>
  );
}

function StepHeading({ title, description }: { title: string; description: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-[-0.02em]">{title}</h1>
      <p className="mt-1.5 text-sm leading-6 text-ink-soft">{description}</p>
    </div>
  );
}

function UnlockStep({ onUnlocked }: { onUnlocked: () => void }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { response, json } = await post("/api/setup/unlock", { token });
      if (response.ok) onUnlocked();
      else setError(json.error?.message ?? "Could not unlock setup.");
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <StepHeading
        title="Unlock setup"
        description="To prove you operate this server, paste the one-time setup token it printed when it started."
      />
      <Field label="Setup token" htmlFor="setup-token" error={error} required>
        <Input id="setup-token" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" spellCheck={false} className="h-10 font-mono" autoFocus required />
      </Field>
      <div className="mt-4 rounded-control bg-sunken px-4 py-3 text-xs leading-6 text-ink-soft">
        <p className="font-semibold text-ink">Where to find it</p>
        <p>It is printed in the server log when SignalHub starts, and saved in the data directory:</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>Docker: <code className="font-mono">docker compose exec signalhub cat /app/data/setup-token</code></li>
          <li>Node: <code className="font-mono">cat data/setup-token</code> in the SignalHub directory</li>
        </ul>
        <details className="mt-2">
          <summary className="cursor-pointer font-semibold text-ink">Lost it, or someone else saw it?</summary>
          <p className="mt-1">Create a new token; the old one stops working at once:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>Docker: <code className="font-mono">docker compose exec signalhub node dist-runtime/signalhubctl.mjs setup --new-token</code></li>
            <li>Node: <code className="font-mono">npm run signalhubctl -- setup --new-token</code></li>
          </ul>
        </details>
      </div>
      <Button type="submit" size="lg" loading={loading} className="mt-6 w-full"><KeyRound aria-hidden size={16} />Unlock</Button>
    </form>
  );
}

function CheckList({ checks }: { checks: Check[] }) {
  if (!checks.length) return null;
  return (
    <ul className="mt-5 space-y-2" aria-label="Connection checks">
      {checks.map((check) => {
        const Icon = check.status === "pass" ? CheckCircle2 : check.status === "warn" ? AlertTriangle : XCircle;
        return (
          <li key={check.id} className={cn(
            "flex items-start gap-2.5 rounded-control border px-3 py-2 text-sm",
            check.status === "pass" && "border-ok/25 bg-ok-bg text-ok-fg",
            check.status === "warn" && "border-warn/40 bg-warn-bg text-warn-fg",
            check.status === "fail" && "border-danger/25 bg-danger-bg text-danger-fg",
          )}>
            <Icon aria-hidden size={16} className="mt-0.5 shrink-0" />
            <span>{check.message}</span>
          </li>
        );
      })}
    </ul>
  );
}

function DatabaseStep({ bundledDatabase, defaultAppUrl, onSaved }: { bundledDatabase: boolean; defaultAppUrl: string; onSaved: () => void }) {
  const [method, setMethod] = useState<ConnectionMethod>(bundledDatabase ? "bundled" : "fields");
  const [fields, setFields] = useState({ host: "", port: "5432", database: "signalhub", user: "signalhub", password: "", sslMode: "verify-full" });
  const [url, setUrl] = useState("");
  const [ca, setCa] = useState("");
  const [appUrl, setAppUrl] = useState(defaultAppUrl);
  const [checks, setChecks] = useState<Check[]>([]);
  const [tested, setTested] = useState<{ ok: boolean; needsConfirmation: boolean } | null>(null);
  const [missingDatabase, setMissingDatabase] = useState<string | null>(null);
  const [confirmShared, setConfirmShared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"test" | "save" | "create" | null>(null);
  const appUrlRef = useRef<HTMLInputElement>(null);

  const connection = method === "bundled"
    ? { method }
    : method === "url"
      ? { method, url, ca }
      : { method, ...fields, port: Number(fields.port), ca: fields.sslMode === "verify-full" ? ca : "" };

  function update(patch: Partial<typeof fields>) {
    setFields((current) => ({ ...current, ...patch }));
    setTested(null);
  }

  async function test() {
    setBusy("test");
    setError(null);
    try {
      const { response, json } = await post("/api/setup/database/test", connection);
      if (!response.ok) {
        setError(json.error?.message ?? "The connection test failed.");
        setChecks([]);
        setTested(null);
        return;
      }
      setChecks((json.checks as Check[]) ?? []);
      setTested({ ok: Boolean(json.ok), needsConfirmation: Boolean(json.needsConfirmation) });
      setMissingDatabase(typeof json.missingDatabase === "string" ? json.missingDatabase : null);
    } catch {
      setError("The test timed out. Check the host and that this server can reach it.");
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    setBusy("create");
    setError(null);
    try {
      const { response, json } = await post("/api/setup/database/create", connection);
      if (!response.ok) {
        setError(json.error?.message ?? "Could not create the database.");
        return;
      }
    } catch {
      setError("Could not reach the server. Try again.");
      return;
    } finally {
      setBusy(null);
    }
    await test();
  }

  async function save() {
    setBusy("save");
    setError(null);
    try {
      const { response, json } = await post("/api/setup/database", { connection, appUrl, confirmUnrelatedTables: confirmShared });
      if (response.ok) {
        onSaved();
        return;
      }
      if (json.error?.checks) setChecks(json.error.checks);
      if (json.error?.code === "SETUP_INVALID_APP_URL") appUrlRef.current?.focus();
      setError(json.error?.message ?? "Could not save the database settings.");
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const methods: Array<{ id: ConnectionMethod; label: string }> = [
    ...(bundledDatabase ? [{ id: "bundled" as const, label: "Bundled PostgreSQL" }] : []),
    { id: "fields", label: "Connection details" },
    { id: "url", label: "Connection URL" },
  ];
  const canSave = tested?.ok && (!tested.needsConfirmation || confirmShared);

  return (
    <div>
      <StepHeading
        title="Connect your database"
        description="SignalHub stores everything in PostgreSQL 14 or newer. Use a managed database (RDS, Cloud SQL, Azure, Neon, Supabase…) or your own server. An empty, dedicated database is best."
      />

      <div role="tablist" aria-label="Connection method" className="mb-5 inline-flex flex-wrap gap-1 rounded-control bg-sunken p-1">
        {methods.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={method === item.id}
            onClick={() => { setMethod(item.id); setTested(null); setChecks([]); }}
            className={cn(
              "rounded-control px-3 py-1.5 text-sm font-medium transition-colors",
              method === item.id ? "bg-surface text-ink shadow-card" : "text-ink-soft hover:text-ink",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {method === "bundled" && (
        <Alert tone="info" title="Use the PostgreSQL container started with this installation">
          Good for trying SignalHub. For production, prefer a managed database with automatic backups.
        </Alert>
      )}

      {method === "fields" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Host" htmlFor="db-host" hint="Name or IP address of the database server" required>
            <Input id="db-host" value={fields.host} onChange={(event) => update({ host: event.target.value })} placeholder="db.example.com" autoComplete="off" spellCheck={false} required />
          </Field>
          <Field label="Port" htmlFor="db-port" required>
            <Input id="db-port" value={fields.port} onChange={(event) => update({ port: event.target.value.replace(/\D/g, "").slice(0, 5) })} inputMode="numeric" required />
          </Field>
          <Field label="Database name" htmlFor="db-name" required>
            <Input id="db-name" value={fields.database} onChange={(event) => update({ database: event.target.value })} autoComplete="off" spellCheck={false} required />
          </Field>
          <Field label="User" htmlFor="db-user" required>
            <Input id="db-user" value={fields.user} onChange={(event) => update({ user: event.target.value })} autoComplete="off" spellCheck={false} required />
          </Field>
          <Field label="Password" htmlFor="db-password" className="sm:col-span-2">
            <Input id="db-password" type="password" value={fields.password} onChange={(event) => update({ password: event.target.value })} autoComplete="new-password" />
          </Field>
          <Field label="Encryption (SSL/TLS)" htmlFor="db-ssl-mode" className="sm:col-span-2" hint={
            fields.sslMode === "verify-full"
              ? "Encrypted and the server certificate is checked. Paste your provider's CA below if it is not publicly trusted."
              : fields.sslMode === "no-verify"
                ? "Encrypted, but the certificate is not checked. Use only when your provider gives no CA certificate."
                : "Not encrypted. Use only on a private network, such as a database container on the same host."
          }>
            <Select id="db-ssl-mode" value={fields.sslMode} onChange={(event) => update({ sslMode: event.target.value })} className="w-full">
              <option value="verify-full">Required, verify certificate (recommended)</option>
              <option value="no-verify">Required, do not verify certificate</option>
              <option value="disable">Disabled</option>
            </Select>
          </Field>
        </div>
      )}

      {method === "url" && (
        <Field label="Connection URL" htmlFor="db-url" hint="Use the direct connection string, not a transaction pooler (often port 6543)." required>
          <Input id="db-url" value={url} onChange={(event) => { setUrl(event.target.value); setTested(null); }} placeholder="postgresql://user:password@host:5432/signalhub?sslmode=verify-full" autoComplete="off" spellCheck={false} className="font-mono" required />
        </Field>
      )}

      {(method === "url" || (method === "fields" && fields.sslMode === "verify-full")) && (
        <details className="mt-4 rounded-control border border-line px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">Custom CA certificate (RDS, Azure, Cloud SQL…)</summary>
          <Textarea value={ca} onChange={(event) => { setCa(event.target.value); setTested(null); }} rows={5} placeholder="-----BEGIN CERTIFICATE-----" className="mt-3 font-mono text-xs" spellCheck={false} />
        </details>
      )}

      <div className="mt-5">
        <Button type="button" variant="secondary" onClick={test} loading={busy === "test"} disabled={busy === "save"}>
          <Database aria-hidden size={16} />Test connection
        </Button>
      </div>
      <CheckList checks={checks} />
      {missingDatabase && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-control border border-line px-4 py-3 text-sm">
          <span className="min-w-0 flex-1">The server is reachable but has no database named <span className="font-semibold">{missingDatabase}</span>. SignalHub can create it if this user is allowed to.</span>
          <Button type="button" variant="secondary" size="sm" onClick={create} loading={busy === "create"} disabled={busy !== null && busy !== "create"}>
            Create database
          </Button>
        </div>
      )}
      {tested?.needsConfirmation && (
        <label className="mt-3 flex items-start gap-2.5 text-sm">
          <Checkbox checked={confirmShared} onChange={(event) => setConfirmShared(event.target.checked)} className="mt-0.5" />
          <span>Use this database anyway. SignalHub adds its own tables alongside the existing ones.</span>
        </label>
      )}

      <div className="mt-6 border-t border-line pt-6">
        <Field label="Public URL" htmlFor="app-url" hint="The address people will use to reach SignalHub. Used in emails and links.">
          <Input id="app-url" ref={appUrlRef} value={appUrl} onChange={(event) => setAppUrl(event.target.value)} placeholder="https://status.example.com" autoComplete="url" spellCheck={false} />
        </Field>
      </div>

      {error && <Alert tone="danger" className="mt-5">{error}</Alert>}
      <Button type="button" size="lg" className="mt-6 w-full" onClick={save} loading={busy === "save"} disabled={!canSave || busy === "test"}>
        Save and continue
      </Button>
      {!tested && <p className="mt-2 text-center text-xs text-ink-dim">Test the connection to continue.</p>}
    </div>
  );
}

function AdminStep({ passwordMinimum, backupAvailable, databaseChangeable, onChangeDatabase, onCreated }: {
  passwordMinimum: number;
  backupAvailable: boolean;
  databaseChangeable: boolean;
  onChangeDatabase: () => void;
  onCreated: (username: string) => void;
}) {
  const [confirmChange, setConfirmChange] = useState(false);
  const [changing, setChanging] = useState(false);
  const [form, setForm] = useState({ organizationName: "", organizationSlug: "", name: "", username: "admin", email: "", password: "", confirm: "" });
  const [slugEdited, setSlugEdited] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update(patch: Partial<typeof form>) {
    setForm((current) => {
      const next = { ...current, ...patch };
      if (patch.organizationName !== undefined && !slugEdited) next.organizationSlug = slugify(patch.organizationName);
      return next;
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (form.password !== form.confirm) {
      setErrors({ confirm: "The passwords do not match" });
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const { confirm: _confirm, ...body } = form;
      void _confirm;
      const { response, json } = await post("/api/setup/admin", body);
      if (response.ok) {
        onCreated(String(json.username ?? form.username));
        return;
      }
      if (json.error?.fields) setErrors(json.error.fields);
      setError(json.error?.message ?? "Could not create the administrator.");
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function changeDatabase() {
    setChanging(true);
    setError(null);
    try {
      const { response, json } = await post("/api/setup/database/reset", {});
      if (response.ok) {
        onChangeDatabase();
        return;
      }
      setError(json.error?.message ?? "Could not change the database.");
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setChanging(false);
    }
  }

  const tooShort = form.password.length > 0 && form.password.length < passwordMinimum;

  return (
    <form onSubmit={submit} noValidate>
      <StepHeading
        title="Create the administrator"
        description="This account manages your organization and the whole installation. You can invite more people after signing in."
      />
      {backupAvailable && (
        <Alert tone="warn" title="Back up your configuration" className="mb-6">
          <p>The configuration file holds the database connection and the encryption key for stored credentials. Without it, encrypted data cannot be recovered.</p>
          <Link href="/api/setup/backup" prefetch={false} download className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-2" })}>
            <Download aria-hidden size={14} />Download backup
          </Link>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Organization name" htmlFor="admin-org" error={errors.organizationName} required>
          <Input id="admin-org" value={form.organizationName} onChange={(event) => update({ organizationName: event.target.value })} placeholder="Acme Inc." autoComplete="organization" required />
        </Field>
        <Field label="Organization ID" htmlFor="admin-slug" error={errors.organizationSlug} hint="Lowercase letters, numbers and hyphens" required>
          <Input id="admin-slug" value={form.organizationSlug} onChange={(event) => { setSlugEdited(true); update({ organizationSlug: event.target.value.toLowerCase() }); }} spellCheck={false} required />
        </Field>
        <Field label="Your name" htmlFor="admin-name" error={errors.name} required>
          <Input id="admin-name" value={form.name} onChange={(event) => update({ name: event.target.value })} autoComplete="name" required />
        </Field>
        <Field label="Email" htmlFor="admin-email" error={errors.email} required>
          <Input id="admin-email" type="email" value={form.email} onChange={(event) => update({ email: event.target.value })} autoComplete="email" required />
        </Field>
        <Field label="User ID" htmlFor="admin-username" error={errors.username} hint="Used to sign in" className="sm:col-span-2" required>
          <Input id="admin-username" value={form.username} onChange={(event) => update({ username: event.target.value })} autoComplete="username" spellCheck={false} required />
        </Field>
        <Field label="Password" htmlFor="admin-password" error={errors.password ?? (tooShort ? `At least ${passwordMinimum} characters` : undefined)} hint={`At least ${passwordMinimum} characters. Must not contain your name, user ID or email.`} required>
          <Input id="admin-password" type="password" value={form.password} onChange={(event) => update({ password: event.target.value })} autoComplete="new-password" required />
        </Field>
        <Field label="Confirm password" htmlFor="admin-confirm" error={errors.confirm} required>
          <Input id="admin-confirm" type="password" value={form.confirm} onChange={(event) => update({ confirm: event.target.value })} autoComplete="new-password" required />
        </Field>
      </div>
      {error && <Alert tone="danger" className="mt-5">{error}</Alert>}
      <Button type="submit" size="lg" loading={loading} className="mt-6 w-full">Create administrator</Button>
      {databaseChangeable && (
        <div className="mt-5 border-t border-line pt-4 text-center text-sm text-ink-soft">
          {confirmChange ? (
            <div className="space-y-2">
              <p>SignalHub will forget the saved connection and ask for a database again. Nothing in that database is deleted.</p>
              <div className="flex justify-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmChange(false)} disabled={changing}>Cancel</Button>
                <Button type="button" variant="secondary" size="sm" loading={changing} onClick={changeDatabase}>Use a different database</Button>
              </div>
            </div>
          ) : (
            <button type="button" className="font-medium text-primary-ink underline-offset-4 hover:underline" onClick={() => setConfirmChange(true)}>
              Wrong database? Start over with a different one
            </button>
          )}
        </div>
      )}
    </form>
  );
}

function DoneStep({ username }: { username: string }) {
  return (
    <div className="py-4 text-center">
      <span className="mx-auto inline-flex size-12 items-center justify-center rounded-full bg-ok-bg text-ok-fg"><CheckCircle2 aria-hidden size={26} /></span>
      <h1 className="mt-4 text-2xl font-bold tracking-[-0.02em]">SignalHub is ready</h1>
      <p className="mt-2 text-sm leading-6 text-ink-soft">
        Sign in{username ? <> as <span className="font-semibold text-ink">{username}</span></> : null} to create your first status page.
      </p>
      <Link href="/login" prefetch={false} className={buttonVariants({ size: "lg", className: "mt-6 w-full" })}>Go to sign in</Link>
    </div>
  );
}

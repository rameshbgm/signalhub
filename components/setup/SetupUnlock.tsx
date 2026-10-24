import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export function SetupUnlock({ invalid }: { invalid: boolean }) {
  return (
    <main className="min-h-screen bg-wash px-4 py-12 text-ink">
      <div className="mx-auto w-full max-w-lg rounded-card border border-line bg-surface p-6 shadow-card sm:p-8">
        <h1 className="text-2xl font-bold">Unlock SignalHub setup</h1>
        <p className="mt-2 text-sm leading-6 text-ink-soft">Enter the setup token shown in the server startup logs. Only the person operating this installation should have this token.</p>
        <form action="/api/setup/unlock" method="post" className="mt-6 space-y-4">
          {invalid && <Alert tone="danger" title="Invalid setup token">Copy the current token from the server logs and try again.</Alert>}
          <Field label="Setup token" htmlFor="setup-token" required>
            <Input id="setup-token" name="token" type="password" autoComplete="off" minLength={32} maxLength={256} required />
          </Field>
          <Button type="submit">Unlock setup</Button>
        </form>
      </div>
    </main>
  );
}

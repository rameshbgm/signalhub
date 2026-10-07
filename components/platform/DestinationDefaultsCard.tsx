import { Save } from "lucide-react";
import { updateDestinationDefaults } from "@/app/platform/(protected)/configuration/actions";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  DESTINATION_CHANNELS,
  DESTINATION_PROVIDERS,
  defaultConfig,
  defaultable,
  type DestinationDefaults,
} from "@/lib/destination-catalog";

/** Installation-wide starting values for team destinations; organizations can still change them. */
export function DestinationDefaultsCard({ defaults, canManage }: { defaults: DestinationDefaults; canManage: boolean }) {
  const providers = DESTINATION_CHANNELS
    .map((channel) => ({ channel, provider: DESTINATION_PROVIDERS[channel], fields: DESTINATION_PROVIDERS[channel].fields.filter(defaultable) }))
    .filter((entry) => entry.fields.length > 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Destination defaults</CardTitle>
        <CardDescription className="max-w-2xl">
          Pre-fill new team destinations across every organization, for example your self-hosted ntfy or Gotify server, the Opsgenie region, or the PagerDuty severity. Organizations can still change these, and existing destinations are not affected.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PlatformActionForm action={updateDestinationDefaults} successMessage="Destination defaults saved" className="space-y-4">
          <fieldset disabled={!canManage} className="grid gap-3 lg:grid-cols-2">
            <legend className="sr-only">Defaults per provider</legend>
            {providers.map(({ channel, provider, fields }) => {
              const values = defaultConfig(channel, defaults);
              const customised = Boolean(defaults[channel]);
              return (
                <details key={channel} className="rounded-control border border-line p-3" open={customised}>
                  <summary className="cursor-pointer text-sm font-semibold text-ink">
                    {provider.label}
                    {customised && <span className="ml-2 text-xs font-normal text-primary-ink">Customized</span>}
                  </summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {fields.map((field) => (
                      <Field key={field.key} label={field.label} htmlFor={`default-${channel}-${field.key}`}>
                        {field.kind === "select" ? (
                          <Select id={`default-${channel}-${field.key}`} name={`default:${channel}:${field.key}`} defaultValue={values[field.key]} className="w-full">
                            {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </Select>
                        ) : (
                          <Input id={`default-${channel}-${field.key}`} name={`default:${channel}:${field.key}`} type="url" defaultValue={values[field.key] ?? ""} placeholder={field.placeholder} />
                        )}
                      </Field>
                    ))}
                  </div>
                </details>
              );
            })}
          </fieldset>
          {canManage && (
            <>
              <Field label="Change reason" htmlFor="defaults-reason" required hint="Recorded in the platform audit log. Minimum 10 characters." className="max-w-2xl">
                <Input id="defaults-reason" name="reason" required minLength={10} maxLength={2000} />
              </Field>
              <div className="flex justify-end">
                <Button type="submit"><Save aria-hidden size={16} />Save defaults</Button>
              </div>
            </>
          )}
        </PlatformActionForm>
      </CardContent>
    </Card>
  );
}

import { Save } from "lucide-react";
import { updatePlatformConfiguration } from "@/app/platform/(protected)/configuration/actions";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  DESTINATION_CHANNELS,
  DESTINATION_PROVIDERS,
  defaultConfig,
  defaultable,
  type DestinationChannel,
  type DestinationDefaults,
} from "@/lib/destination-catalog";

/**
 * Which team destination providers organizations may use, and the starting values for each.
 * A ticked provider shows its defaults; unticking hides them but keeps them for when it is re-enabled.
 */
export function DestinationProvidersCard({ enabled, defaults, canManage }: { enabled: ReadonlySet<DestinationChannel>; defaults: DestinationDefaults; canManage: boolean }) {
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>Team destination providers</CardTitle>
          <CardDescription className="max-w-2xl">
            Ticked providers appear in every organization console, where each organization connects its own credentials. Defaults pre-fill new destinations, for example your self-hosted ntfy server or the Opsgenie region; organizations can still change them, and existing destinations are not affected.
          </CardDescription>
        </div>
        <Badge>{enabled.size} of {DESTINATION_CHANNELS.length} enabled</Badge>
      </CardHeader>
      <CardContent>
        <PlatformActionForm action={updatePlatformConfiguration} successMessage="Destination providers saved" className="space-y-5">
          <fieldset disabled={!canManage} className="grid items-start gap-3 lg:grid-cols-2">
            <legend className="sr-only">Enabled providers and their defaults</legend>
            {DESTINATION_CHANNELS.map((channel) => {
              const provider = DESTINATION_PROVIDERS[channel];
              const fields = provider.fields.filter(defaultable);
              const values = defaultConfig(channel, defaults);
              return (
                // Only the provider checkbox counts: a selected <option> also matches :checked.
                <div key={channel} className="group rounded-control border border-line bg-surface transition-colors duration-200 has-[input[type=checkbox]:checked]:border-primary/40">
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-control px-3.5 py-3 text-sm font-medium text-ink group-has-[input[type=checkbox]:checked]:bg-primary-soft">
                    <Checkbox name="enabledDestinationChannels" value={channel} defaultChecked={enabled.has(channel)} />
                    <span className="flex-1">{provider.label}</span>
                    {defaults[channel] && <span className="text-xs font-normal text-primary-ink">Customized</span>}
                  </label>
                  {fields.length > 0 && (
                    <div className="hidden gap-3 border-t border-line p-3.5 sm:grid-cols-2 group-has-[input[type=checkbox]:checked]:grid">
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
                  )}
                </div>
              );
            })}
          </fieldset>
          {canManage && (
            <>
              <Field label="Change reason" htmlFor="destination-providers-reason" required hint="Recorded in the platform audit log. Minimum 10 characters." className="max-w-2xl">
                <Input id="destination-providers-reason" name="reason" required minLength={10} maxLength={2000} />
              </Field>
              <div className="flex justify-end">
                <Button type="submit"><Save aria-hidden size={16} />Save providers</Button>
              </div>
            </>
          )}
        </PlatformActionForm>
      </CardContent>
    </Card>
  );
}

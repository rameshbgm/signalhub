import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import type { ServiceGroupView } from "@/lib/page-design";

export function ServiceGroupViewField({
  value,
  onChange,
}: {
  value?: ServiceGroupView;
  onChange?: (view: ServiceGroupView) => void;
}) {
  return (
    <Field label="Default service group view" htmlFor="service-group-view" hint="Choose how service groups appear when visitors open the public page.">
      <Select
        id="service-group-view"
        name="groupDefaultView"
        aria-label="Default service group view"
        defaultValue="COLLAPSED"
        value={value}
        onChange={onChange ? (event) => onChange(event.target.value as ServiceGroupView) : undefined}
        className="w-full"
      >
        <option value="COLLAPSED">Collapsed with average uptime</option>
        <option value="EXPANDED">Expanded</option>
      </Select>
    </Field>
  );
}

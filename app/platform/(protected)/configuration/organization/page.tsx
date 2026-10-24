import { ConfigurationHeader } from "@/components/platform/SectionHeaders";
import { OrganizationSettingsSection } from "@/components/platform/OrganizationSettingsSection";
import { requirePlatformPageCapability } from "@/lib/platform-page-guard";

export default async function OrganizationConfigurationPage() {
  await requirePlatformPageCapability("configuration.read");
  return (
    <div className="space-y-6">
      <ConfigurationHeader active="organization" />
      <OrganizationSettingsSection />
    </div>
  );
}

import { Activity, Building2, Fingerprint, KeyRound, ShieldAlert, ShieldCheck, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { SectionTabs } from "@/components/platform/table/SectionTabs";
import { PageHeader } from "@/components/ui/page-header";

/** Header and underlined tabs for installation and organization settings. */
export function ConfigurationHeader({ active }: { active: "platform" | "runtime" | "organization" }) {
  return (
    <>
      <PageHeader
        title="Configuration"
        description="Installation-wide delivery and runtime settings, plus organization defaults. Encryption keys and storage access stay with the deployment environment."
        icon={SlidersHorizontal}
        hue="violet"
      />
      <SectionTabs label="Configuration" active={active} tabs={[
        { id: "platform", label: "Platform configuration", icon: SlidersHorizontal, href: "/organization/platform/configuration" },
        { id: "runtime", label: "Runtime", icon: Activity, href: "/organization/platform/deployment" },
        { id: "organization", label: "Organization", icon: Building2, href: "/organization/platform/configuration/organization" },
      ]} />
    </>
  );
}

/**
 * Header and underlined tabs for Security: enterprise identity with your own MFA, and API keys. Both are
 * available to every role for their own account, so a non-admin sees that page's own header and no tabs.
 */
export function IdentityHeader({ admin, active, fallback }: { admin: boolean; active: "identity" | "api-keys" | "mfa-requests"; fallback?: { title: string; description: string; icon: LucideIcon } }) {
  if (!admin && fallback) return <PageHeader title={fallback.title} description={fallback.description} icon={fallback.icon} hue="violet" />;
  return (
    <>
      <PageHeader
        title="Security"
        description="Enterprise sign-in connections, your authenticator MFA, and programmatic access."
        icon={ShieldCheck}
        hue="violet"
      />
      <SectionTabs label="Security" active={active} tabs={[
        { id: "identity", label: "Identity", icon: Fingerprint, href: "/organization/platform/identity" },
        { id: "mfa-requests", label: "MFA requests", icon: ShieldAlert, href: "/organization/platform/mfa-requests" },
        { id: "api-keys", label: "API keys", icon: KeyRound, href: "/organization/api-keys" },
      ]} />
    </>
  );
}

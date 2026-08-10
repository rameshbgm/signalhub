import { redirect } from "next/navigation";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { isPlatformAuthenticationError } from "@/lib/admin-auth-error";
import type { PlatformCapability } from "@/lib/platform-policy";

/**
 * Page reads redirect expected authorization failures without emitting a
 * framework error stack. Mutations and API routes continue to use the throwing
 * guard so callers receive their structured 401/403 response.
 */
export async function requirePlatformPageCapability(capability: PlatformCapability) {
  try {
    return await requirePlatformCapability(capability);
  } catch (error) {
    if (isPlatformAuthenticationError(error)) redirect("/organization");
    throw error;
  }
}

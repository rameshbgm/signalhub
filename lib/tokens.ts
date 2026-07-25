import { generateSecret } from "@/lib/secrets";

export function generateApiKey() {
  return generateSecret("status_live_");
}

export function generateWebhookSecret() {
  return generateSecret("whsec_");
}

export function generateAutomationToken() {
  return generateSecret("component_");
}

export function generateFeedToken() {
  return generateSecret("feed_");
}

import { nanoid } from "nanoid";

export function generateApiKey() {
  return `sp_live_${nanoid(32)}`;
}

export function generateWebhookSecret() {
  return nanoid(24);
}

import { database } from "@/lib/postgres/client";
import { decryptSecret } from "@/lib/encryption";
import {
  DESTINATION_CHANNELS,
  sanitizeDestinationDefaults,
  type DestinationChannel,
  type DestinationDefaults,
} from "@/lib/destination-catalog";

export async function enabledDestinationChannels(): Promise<DestinationChannel[]> {
  const configuration = await database
    .selectFrom("platformConfiguration")
    .select("enabledDestinationChannels")
    .where("id", "=", "global")
    .executeTakeFirst();
  if (!configuration) return [];
  const enabled = new Set(configuration.enabledDestinationChannels);
  return DESTINATION_CHANNELS.filter((channel) => enabled.has(channel));
}

export async function destinationDefaults(): Promise<DestinationDefaults> {
  const configuration = await database
    .selectFrom("platformConfiguration")
    .select("destinationDefaults")
    .where("id", "=", "global")
    .executeTakeFirst();
  return sanitizeDestinationDefaults(configuration?.destinationDefaults);
}

/** Shared provider connections a platform administrator saved, keyed by channel. Server-only: holds secrets. */
export type DestinationConnections = Partial<Record<DestinationChannel, Record<string, string>>>;

export function parseDestinationConnections(ciphertext: string | null | undefined): DestinationConnections {
  return ciphertext ? JSON.parse(decryptSecret(ciphertext)) as DestinationConnections : {};
}

export async function destinationConnections(): Promise<DestinationConnections> {
  const configuration = await database
    .selectFrom("platformConfiguration")
    .select("destinationConnectionsCiphertext")
    .where("id", "=", "global")
    .executeTakeFirst();
  return parseDestinationConnections(configuration?.destinationConnectionsCiphertext);
}

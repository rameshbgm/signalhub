import { database } from "@/lib/postgres/client";
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
  if (!configuration) return [...DESTINATION_CHANNELS];
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

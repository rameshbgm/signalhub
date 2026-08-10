import { database } from "@/lib/postgres/client";
import {
  DESTINATION_CHANNELS,
  type DestinationChannel,
} from "@/lib/notification-providers";

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

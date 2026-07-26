import { collections } from "@/lib/db";
import {
  DESTINATION_CHANNELS,
  type DestinationChannel,
} from "@/lib/notification-providers";

export async function enabledDestinationChannels(): Promise<DestinationChannel[]> {
  const configuration = await collections.platformConfiguration().findOne({ _id: "global" });
  if (!configuration) return [...DESTINATION_CHANNELS];
  const enabled = new Set(configuration.enabledDestinationChannels);
  return DESTINATION_CHANNELS.filter((channel) => enabled.has(channel));
}

import {
  DESTINATION_PROVIDERS,
  normalizeDestinationConfig,
  type DestinationChannel,
  type DestinationDefaults,
} from "@/lib/destination-catalog";
import { validateHttpTarget } from "@/lib/target-validation";

// Headers a custom destination may not override: they would break or redirect the request.
const RESERVED_HEADERS = new Set(["host", "content-type", "content-length", "transfer-encoding", "connection", "cookie"]);

/** Normalizes a destination's settings and checks every URL is a public HTTPS target. */
export async function validateDestinationConfig(channel: DestinationChannel, input: Record<string, string>, defaults: DestinationDefaults = {}) {
  const config = normalizeDestinationConfig(channel, input, defaults);
  for (const field of DESTINATION_PROVIDERS[channel].fields) {
    if (field.kind === "url" && config[field.key]) {
      config[field.key] = (await validateHttpTarget(config[field.key], { httpsOnly: true, allowPrivate: false })).toString();
    }
  }
  if (config.headerName && (!/^[A-Za-z0-9-]{1,64}$/.test(config.headerName) || RESERVED_HEADERS.has(config.headerName.toLowerCase()))) {
    throw new Error("Header name must be letters, digits and dashes, and not a reserved header");
  }
  return config;
}

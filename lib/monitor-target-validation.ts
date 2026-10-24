import {
  monitorNetworkHostname,
  type MonitorConfiguration,
} from "@/lib/monitor-validation";
import {
  validateHttpTarget,
  validateNetworkHost,
} from "@/lib/target-validation";

/**
 * Performs the DNS-backed SSRF checks used immediately before a monitor or
 * template is persisted.
 */
export async function validateMonitorTarget(
  configuration: MonitorConfiguration,
  allowPrivate: boolean
) {
  if (configuration.type === "HEARTBEAT") return;
  if (configuration.type === "HTTP" || configuration.type === "KEYWORD") {
    await validateHttpTarget(configuration.target, { allowPrivate });
    return;
  }
  await validateNetworkHost(
    monitorNetworkHostname(configuration),
    allowPrivate
  );
}

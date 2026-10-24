import { diagnoseProxy, effectiveProxyTrust, explainModes } from "@/lib/proxy-trust";
import type { ProxyTrustView } from "@/components/platform/ProxyTrustCard";

/** Everything the proxy card shows, for the connection that asked for the page. */
export function buildProxyTrustView(headers: Headers, canManage: boolean): ProxyTrustView {
  const trust = effectiveProxyTrust();
  const diagnosis = diagnoseProxy(headers, trust);
  return {
    canManage,
    mode: trust.mode,
    hops: trust.hops,
    modeLocked: trust.modeSource === "environment",
    hopsLocked: trust.hopsSource === "environment",
    cidrs: [...trust.cidrs],
    cidrsLocked: trust.cidrsSource === "environment",
    cidrsInvalid: [...trust.cidrsInvalid],
    diagnosis,
    explanations: explainModes(diagnosis),
  };
}

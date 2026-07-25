"use client";

import { useEffect } from "react";

export function recordPublicEvent(
  pageSlug: string,
  event: "VIEW" | "INCIDENT_VIEW" | "SUBSCRIPTION_START" | "SUBSCRIPTION_COMPLETE"
) {
  if (navigator.doNotTrack === "1") return;
  const payload = JSON.stringify({ pageSlug, event, referrer: document.referrer });
  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      "/api/v1/analytics/event",
      new Blob([payload], { type: "application/json" })
    );
    return;
  }
  void fetch("/api/v1/analytics/event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // Analytics is best-effort and must never disrupt the public status surface.
  });
}

export function PublicAnalytics({
  pageSlug,
  event = "VIEW",
}: {
  pageSlug: string;
  event?: "VIEW" | "INCIDENT_VIEW";
}) {
  useEffect(() => recordPublicEvent(pageSlug, event), [event, pageSlug]);
  return null;
}

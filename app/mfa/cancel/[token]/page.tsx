import type { Metadata } from "next";
import { CancelMfaRequest } from "@/components/auth/CancelMfaRequest";
import { describeCancelToken } from "@/lib/mfa/requests";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Cancel request · SignalHub",
  robots: { index: false },
  // The token is in the URL: never send it onward in a Referer header.
  referrer: "no-referrer",
};

/** Opening the link changes nothing (mail scanners open links); cancelling needs the button. */
export default async function CancelMfaRequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const request = await describeCancelToken(token);
  return <CancelMfaRequest token={token} username={request?.username ?? null} status={request?.status ?? null} />;
}

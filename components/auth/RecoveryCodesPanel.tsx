"use client";

import { useState } from "react";
import { Download, Mail } from "lucide-react";
import { mfaAction } from "@/components/auth/mfa-client";
import { CopyButton } from "@/components/CopyButton";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/toast";

/**
 * The one-time recovery codes. They are shown once; the person must tick
 * "I've saved these" before continuing. Copy and Download stay in the browser;
 * Email sends them to the signed-in user's own address through the SMTP the
 * administrator configured.
 */
export function RecoveryCodesPanel({ codes, emailAvailable, continueLabel, onContinue, reason }: {
  reason?: string;
  codes: string[];
  emailAvailable: boolean;
  continueLabel: string;
  onContinue: () => Promise<void> | void;
}) {
  const [saved, setSaved] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [continuing, setContinuing] = useState(false);

  function download() {
    const text = ["SignalHub recovery codes", "Each code works once. Keep this file somewhere safe.", "", ...codes, ""].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "signalhub-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function email() {
    setEmailing(true);
    const result = await mfaAction<{ sentTo: string }>("email-codes", { reason });
    setEmailing(false);
    toast(result.ok ? `Recovery codes sent to ${result.body.sentTo}. Delete the email after saving them.` : result.error, result.ok ? "ok" : "danger");
  }

  async function proceed() {
    setContinuing(true);
    try { await onContinue(); } finally { setContinuing(false); }
  }

  return (
    <Alert tone="warn" role="status" title="Save these one-time recovery codes. They will not be shown again.">
      <p className="mt-1">These are your backup if you lose your phone or cannot use your authenticator app. Each code works <strong>once</strong>.</p>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {codes.map((value) => <li key={value}><code className="block whitespace-nowrap rounded-control border border-line-strong bg-surface px-2.5 py-1.5 text-center font-mono text-xs text-ink">{value}</code></li>)}
      </ul>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer font-semibold">How do I use a recovery code?</summary>
        <ol className="mt-1.5 list-decimal space-y-0.5 pl-5">
          <li>On the sign-in screen, enter your User ID and password as usual.</li>
          <li>On the code screen, choose <strong>Use a recovery code instead</strong>.</li>
          <li>Type one code from this list, then sign in. That code is now used up.</li>
          <li>You are emailed when one is used. When fewer than 3 are left, generate new ones in Security settings.</li>
        </ol>
      </details>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <CopyButton value={codes.join("\n")} label="Copy" />
        <Button type="button" variant="secondary" size="sm" onClick={download}><Download aria-hidden size={14} />Download</Button>
        {emailAvailable && <Button type="button" variant="secondary" size="sm" loading={emailing} onClick={() => void email()}><Mail aria-hidden size={14} />Email to me</Button>}
      </div>
      {emailAvailable && <p className="mt-2 text-xs">Emailing keeps a copy in your mailbox. Delete the email once the codes are stored safely.</p>}
      <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm font-medium">
        <Checkbox checked={saved} onChange={(event) => setSaved(event.target.checked)} />
        I&rsquo;ve saved these
      </label>
      <Button type="button" size="sm" className="mt-3" disabled={!saved} loading={continuing} onClick={() => void proceed()}>{continueLabel}</Button>
    </Alert>
  );
}

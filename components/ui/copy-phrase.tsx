"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Quoted phrase to retype for a destructive confirmation, with a button that copies the bare text (no quotes). */
export function CopyPhrase({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }, () => {});
  };
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      “<code className="font-mono text-ink">{text}</code>”
      <button type="button" onClick={copy} data-button-guard="off" aria-label={copied ? "Copied" : `Copy “${text}”`} title={copied ? "Copied" : "Copy to clipboard"} className="inline-flex size-6 items-center justify-center rounded-chip text-ink-soft outline-none hover:bg-sunken hover:text-ink focus-visible:ring-4 focus-visible:ring-primary/25">
        {copied ? <Check aria-hidden size={14} className="text-ok-fg" /> : <Copy aria-hidden size={14} />}
      </button>
    </span>
  );
}

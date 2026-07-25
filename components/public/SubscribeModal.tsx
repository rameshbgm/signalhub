"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { recordPublicEvent } from "@/components/public/PublicAnalytics";

type Component = { id: string; name: string };

const inputClass =
  "w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:outline-none focus:border-[var(--cyan)] transition-colors";

export function SubscribeModal({
  pageSlug,
  brandColor,
  components,
  feedsEnabled = true,
  feedBasePath,
}: {
  pageSlug: string;
  brandColor: string;
  components: Component[];
  feedsEnabled?: boolean;
  feedBasePath?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"email" | "sms" | "feed">("email");
  const [capabilities, setCapabilities] = useState<{
    email: { enabled: boolean; reason: string | null };
    sms: { enabled: boolean; reason: string | null };
  } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/v1/subscribe/capabilities", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Capability check failed");
        return response.json();
      })
      .then(setCapabilities)
      .catch(() => setCapabilities({
        email: { enabled: false, reason: "Delivery status could not be checked" },
        sms: { enabled: false, reason: "Delivery status could not be checked" },
      }));
    const dialog = dialogRef.current;
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
        ) ?? []
      );
    focusable()[0]?.focus();
    function keyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
      if (event.key === "Tab") {
        const items = focusable();
        if (!items.length) return;
        const first = items[0];
        const last = items.at(-1)!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", keyDown);
    return () => document.removeEventListener("keydown", keyDown);
  }, [open]);

  function close() {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => {
          setOpen(true);
          recordPublicEvent(pageSlug, "SUBSCRIPTION_START");
        }}
        className="inline-flex items-center gap-2 px-4 py-2.5 text-[var(--bg)] text-sm font-medium hover:opacity-90 transition-opacity"
        style={{ backgroundColor: brandColor }}
        aria-haspopup="dialog"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Subscribe to Updates
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => event.target === event.currentTarget && close()}>
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="subscribe-title" className="w-full max-w-md border border-[var(--line-bright)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 id="subscribe-title" className="font-mono text-lg font-semibold text-[var(--fg)]">Get notified</h3>
              <button onClick={close} className="p-1 text-[var(--fg-dim)] hover:bg-[var(--surface-raised)] hover:text-[var(--fg)]" aria-label="Close subscription dialog">×</button>
            </div>
            <div role="tablist" className="mb-5 flex gap-1 border-b border-[var(--line)] text-sm">
              <button role="tab" aria-selected={tab === "email"} onClick={() => setTab("email")} className={`border-b-2 px-3 py-2 ${tab === "email" ? "font-medium" : "border-transparent text-[var(--fg-soft)]"}`} style={tab === "email" ? { borderColor: brandColor, color: brandColor } : undefined}>Email</button>
              <button role="tab" aria-selected={tab === "sms"} onClick={() => setTab("sms")} className={`border-b-2 px-3 py-2 ${tab === "sms" ? "font-medium" : "border-transparent text-[var(--fg-soft)]"}`} style={tab === "sms" ? { borderColor: brandColor, color: brandColor } : undefined}>SMS</button>
              {feedsEnabled && (
                <button role="tab" aria-selected={tab === "feed"} onClick={() => setTab("feed")} className={`border-b-2 px-3 py-2 ${tab === "feed" ? "font-medium" : "border-transparent text-[var(--fg-soft)]"}`} style={tab === "feed" ? { borderColor: brandColor, color: brandColor } : undefined}>RSS / Atom</button>
              )}
            </div>
            {tab === "email" && (
              <ContactTab
                pageSlug={pageSlug}
                components={components}
                brandColor={brandColor}
                channel="EMAIL"
                enabled={capabilities?.email.enabled ?? false}
                unavailableReason={capabilities?.email.reason ?? (capabilities ? null : "Checking delivery availability…")}
              />
            )}
            {tab === "sms" && (
              <ContactTab
                pageSlug={pageSlug}
                components={components}
                brandColor={brandColor}
                channel="SMS"
                enabled={capabilities?.sms.enabled ?? false}
                unavailableReason={capabilities?.sms.reason ?? (capabilities ? null : "Checking delivery availability…")}
              />
            )}
            {tab === "feed" && <FeedTab pageSlug={pageSlug} feedBasePath={feedBasePath} />}
            <p className="mt-4 text-xs text-[var(--fg-dim)]">Every verified subscription includes a private unsubscribe link.</p>
          </div>
        </div>
      )}
    </>
  );
}

function ComponentPicker({
  components,
  selected,
  onChange,
}: {
  components: Component[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  if (!components.length) return null;
  return (
    <fieldset className="mb-3">
      <legend className="mb-1 text-xs text-[var(--fg-soft)]">Only notify me about (leave empty for all)</legend>
      <div className="max-h-28 space-y-1.5 overflow-y-auto border border-[var(--line)] bg-[var(--bg)] p-2">
        {components.map((component) => (
          <label key={component.id} className="flex cursor-pointer items-center gap-2 text-sm text-[var(--fg-soft)]">
            <input
              type="checkbox"
              checked={selected.includes(component.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, component.id]
                    : selected.filter((id) => id !== component.id)
                )
              }
            />
            {component.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ContactTab({
  pageSlug,
  components,
  brandColor,
  channel,
  enabled,
  unavailableReason,
}: {
  pageSlug: string;
  components: Component[];
  brandColor: string;
  channel: "EMAIL" | "SMS";
  enabled: boolean;
  unavailableReason: string | null;
}) {
  const [contact, setContact] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [stage, setStage] = useState<"form" | "otp" | "done">("form");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isEmail = channel === "EMAIL";

  async function post(path: string, body: Record<string, unknown>) {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) setMessage(data.error?.message ?? "Something went wrong");
      return response.ok;
    } catch {
      setMessage("Unable to reach the subscription service. Check your connection and try again.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  if (stage === "done") {
    return <SubscriptionComplete pageSlug={pageSlug} channel={channel} />;
  }
  if (!enabled && stage === "form") {
    return (
      <div role="status" className="border border-[var(--amber)]/30 bg-[var(--amber-soft)] p-3 text-sm text-[var(--amber)]">
        {unavailableReason ?? "This delivery channel is unavailable."}
      </div>
    );
  }
  if (stage === "otp") {
    return (
      <div>
        <p className="mb-2 text-sm text-[var(--fg-soft)]">Enter the six-digit code sent to {contact}.</p>
        <label className="sr-only" htmlFor="subscription-code">Verification code</label>
        <input id="subscription-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="123456" className={`${inputClass} mb-2`} />
        {message && <p role="alert" className="mb-2 text-xs text-[var(--red)]">{message}</p>}
        <button disabled={loading || !/^\d{6}$/.test(code)} onClick={async () => (await post("/api/v1/subscribe/verify-otp", { pageSlug, channel, contact, code })) && setStage("done")} className="w-full py-2.5 text-sm font-medium text-[var(--bg)] disabled:opacity-50" style={{ backgroundColor: brandColor }}>{loading ? "Verifying…" : "Verify & Subscribe"}</button>
      </div>
    );
  }
  return (
    <div>
      <label className="sr-only" htmlFor={`subscription-${channel.toLowerCase()}`}>{isEmail ? "Email address" : "Phone number"}</label>
      <input
        id={`subscription-${channel.toLowerCase()}`}
        value={contact}
        onChange={(event) => setContact(event.target.value)}
        type={isEmail ? "email" : "tel"}
        autoComplete={isEmail ? "email" : "tel"}
        placeholder={isEmail ? "you@example.com" : "+14155550123"}
        className={`${inputClass} mb-3`}
        style={{ "--tw-ring-color": brandColor } as CSSProperties}
      />
      <ComponentPicker components={components} selected={selected} onChange={setSelected} />
      {message && <p role="alert" className="mb-2 text-xs text-[var(--red)]">{message}</p>}
      <button disabled={loading || !contact} onClick={async () => (await post("/api/v1/subscribe/request-otp", { pageSlug, channel, contact, componentIds: selected })) && setStage("otp")} className="w-full py-2.5 text-sm font-medium text-[var(--bg)] disabled:opacity-50" style={{ backgroundColor: brandColor }}>{loading ? "Sending…" : "Send verification code"}</button>
    </div>
  );
}

function SubscriptionComplete({ pageSlug, channel }: { pageSlug: string; channel: "EMAIL" | "SMS" }) {
  useEffect(() => recordPublicEvent(pageSlug, "SUBSCRIPTION_COMPLETE"), [pageSlug]);
  return <p role="status" className="text-sm text-[var(--cyan)]">You’re subscribed. Incident updates will arrive by {channel === "EMAIL" ? "email" : "SMS"}.</p>;
}

function FeedTab({ pageSlug, feedBasePath }: { pageSlug: string; feedBasePath?: string }) {
  const base = feedBasePath ?? `/api/v1/feeds/${pageSlug}`;
  return (
    <div className="space-y-2 text-sm">
      <p className="text-[var(--fg-soft)]">Follow incident history in your feed reader.</p>
      <a className="block text-[var(--cyan)] underline" href={`${base}/rss`}>RSS Feed</a>
      <a className="block text-[var(--cyan)] underline" href={`${base}/atom`}>Atom Feed</a>
    </div>
  );
}

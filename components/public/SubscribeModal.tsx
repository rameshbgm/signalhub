"use client";

import { useState, type CSSProperties } from "react";

type Component = { id: string; name: string };

const COUNTRY_CODES = [
  { code: "+1", label: "US/Canada" },
  { code: "+44", label: "UK" },
  { code: "+91", label: "India" },
  { code: "+61", label: "Australia" },
  { code: "+81", label: "Japan" },
  { code: "+49", label: "Germany" },
  { code: "+33", label: "France" },
  { code: "+55", label: "Brazil" },
  { code: "+27", label: "South Africa" },
  { code: "+65", label: "Singapore" },
  { code: "+971", label: "UAE" },
  { code: "+234", label: "Nigeria" },
];

export function SubscribeModal({ pageSlug, brandColor, components }: { pageSlug: string; brandColor: string; components: Component[] }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"email" | "sms" | "slack" | "webhook" | "feed">("email");

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-white text-sm font-medium shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
        style={{ backgroundColor: brandColor }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path
            d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Subscribe to Updates
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-[fadeIn_150ms_ease-out]"
          onClick={() => setOpen(false)}
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-display font-semibold text-gray-900">Get notified</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md p-1 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="flex gap-1 mb-5 border-b border-gray-200 overflow-x-auto text-sm">
              {(["email", "sms", "slack", "webhook", "feed"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-2 capitalize whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
                    tab === t ? "border-blue-600 text-blue-600 font-medium" : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            {tab === "email" && <EmailTab pageSlug={pageSlug} components={components} brandColor={brandColor} />}
            {tab === "sms" && <SmsTab pageSlug={pageSlug} components={components} brandColor={brandColor} />}
            {tab === "slack" && <SimpleChannelTab pageSlug={pageSlug} channel="SLACK" placeholder="https://hooks.slack.com/services/..." label="Slack Incoming Webhook URL" brandColor={brandColor} />}
            {tab === "webhook" && <SimpleChannelTab pageSlug={pageSlug} channel="WEBHOOK" placeholder="https://example.com/webhook" label="Webhook URL" brandColor={brandColor} />}
            {tab === "feed" && <FeedTab pageSlug={pageSlug} />}
            <p className="text-xs text-gray-400 mt-4">
              By subscribing you agree to our Terms of Service and Privacy Policy. You can unsubscribe at any time.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function ComponentPicker({ components, selected, onChange }: { components: Component[]; selected: string[]; onChange: (ids: string[]) => void }) {
  if (components.length === 0) return null;
  return (
    <div className="mb-3">
      <p className="text-xs text-gray-500 mb-1">Only notify me about (leave empty for all):</p>
      <div className="max-h-28 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1.5">
        {components.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={selected.includes(c.id)}
              onChange={(e) => {
                onChange(e.target.checked ? [...selected, c.id] : selected.filter((id) => id !== c.id));
              }}
            />
            {c.name}
          </label>
        ))}
      </div>
    </div>
  );
}

function EmailTab({ pageSlug, components, brandColor }: { pageSlug: string; components: Component[]; brandColor: string }) {
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [stage, setStage] = useState<"form" | "otp" | "done">("form");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function requestOtp() {
    setLoading(true);
    setMsg(null);
    const res = await fetch(`/api/v1/subscribe/request-otp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageSlug, channel: "EMAIL", contact: email, componentIds: selected }),
    });
    setLoading(false);
    if (res.ok) setStage("otp");
    else setMsg((await res.json()).error ?? "Something went wrong");
  }

  async function verifyOtp() {
    setLoading(true);
    setMsg(null);
    const res = await fetch(`/api/v1/subscribe/verify-otp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageSlug, channel: "EMAIL", contact: email, code }),
    });
    setLoading(false);
    if (res.ok) setStage("done");
    else setMsg((await res.json()).error ?? "Invalid code");
  }

  if (stage === "done") return <p className="text-sm text-green-700">You're subscribed! You'll be notified of incidents by email.</p>;

  if (stage === "otp") {
    return (
      <div>
        <p className="text-sm text-gray-600 mb-2">We sent a 6-digit code to {email}. Enter it below.</p>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0 mb-2 transition-shadow" style={{ "--tw-ring-color": brandColor } as CSSProperties} />
        {msg && <p className="text-xs text-red-600 mb-2">{msg}</p>}
        <button disabled={loading} onClick={verifyOtp} style={{ backgroundColor: brandColor }} className="w-full text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity cursor-pointer">
          {loading ? "Verifying..." : "Verify & Subscribe"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        placeholder="you@example.com"
        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 mb-3 transition-shadow" style={{ "--tw-ring-color": brandColor } as CSSProperties}
      />
      <ComponentPicker components={components} selected={selected} onChange={setSelected} />
      {msg && <p className="text-xs text-red-600 mb-2">{msg}</p>}
      <button disabled={loading || !email} onClick={requestOtp} style={{ backgroundColor: brandColor }} className="w-full text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity cursor-pointer">
        {loading ? "Sending..." : "Send verification code"}
      </button>
    </div>
  );
}

function SmsTab({ pageSlug, components, brandColor }: { pageSlug: string; components: Component[]; brandColor: string }) {
  const [country, setCountry] = useState("+1");
  const [phone, setPhone] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [stage, setStage] = useState<"form" | "otp" | "done">("form");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fullNumber = `${country}${phone.replace(/\D/g, "")}`;

  async function requestOtp() {
    setLoading(true);
    setMsg(null);
    const res = await fetch(`/api/v1/subscribe/request-otp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageSlug, channel: "SMS", contact: fullNumber, componentIds: selected }),
    });
    setLoading(false);
    if (res.ok) setStage("otp");
    else setMsg((await res.json()).error ?? "Something went wrong");
  }

  async function verifyOtp() {
    setLoading(true);
    setMsg(null);
    const res = await fetch(`/api/v1/subscribe/verify-otp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageSlug, channel: "SMS", contact: fullNumber, code }),
    });
    setLoading(false);
    if (res.ok) setStage("done");
    else setMsg((await res.json()).error ?? "Invalid code");
  }

  if (stage === "done") return <p className="text-sm text-green-700">You're subscribed! You'll receive SMS alerts.</p>;

  if (stage === "otp") {
    return (
      <div>
        <p className="text-sm text-gray-600 mb-2">We sent a 6-digit code to {fullNumber}. Enter it below.</p>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0 mb-2 transition-shadow" style={{ "--tw-ring-color": brandColor } as CSSProperties} />
        {msg && <p className="text-xs text-red-600 mb-2">{msg}</p>}
        <button disabled={loading} onClick={verifyOtp} style={{ backgroundColor: brandColor }} className="w-full text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity cursor-pointer">
          {loading ? "Verifying..." : "Verify & Subscribe"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <select value={country} onChange={(e) => setCountry(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-2.5 text-sm focus:outline-none focus:ring-2 transition-shadow" style={{ "--tw-ring-color": brandColor } as CSSProperties}>
          {COUNTRY_CODES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} {c.label}
            </option>
          ))}
        </select>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="5551234567" className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition-shadow" style={{ "--tw-ring-color": brandColor } as CSSProperties} />
      </div>
      <ComponentPicker components={components} selected={selected} onChange={setSelected} />
      {msg && <p className="text-xs text-red-600 mb-2">{msg}</p>}
      <button disabled={loading || !phone} onClick={requestOtp} style={{ backgroundColor: brandColor }} className="w-full text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity cursor-pointer">
        {loading ? "Sending..." : "Send verification code"}
      </button>
    </div>
  );
}

function SimpleChannelTab({ pageSlug, channel, placeholder, label, brandColor }: { pageSlug: string; channel: string; placeholder: string; label: string; brandColor: string }) {
  const [contact, setContact] = useState("");
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function subscribe() {
    setLoading(true);
    setMsg(null);
    const res = await fetch(`/api/v1/subscribe/direct`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageSlug, channel, contact }),
    });
    setLoading(false);
    if (res.ok) setDone(true);
    else setMsg((await res.json()).error ?? "Something went wrong");
  }

  if (done) return <p className="text-sm text-green-700">Subscribed! You'll receive events at this endpoint.</p>;

  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder={placeholder} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 mb-3 transition-shadow" style={{ "--tw-ring-color": brandColor } as CSSProperties} />
      {msg && <p className="text-xs text-red-600 mb-2">{msg}</p>}
      <button disabled={loading || !contact} onClick={subscribe} style={{ backgroundColor: brandColor }} className="w-full text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity cursor-pointer">
        {loading ? "Subscribing..." : "Subscribe"}
      </button>
    </div>
  );
}

function FeedTab({ pageSlug }: { pageSlug: string }) {
  return (
    <div className="text-sm space-y-2">
      <p className="text-gray-600">Subscribe to incident history via feed reader:</p>
      <a className="block text-blue-600 underline" href={`/api/v1/feeds/${pageSlug}/rss`}>
        RSS Feed
      </a>
      <a className="block text-blue-600 underline" href={`/api/v1/feeds/${pageSlug}/atom`}>
        Atom Feed
      </a>
    </div>
  );
}

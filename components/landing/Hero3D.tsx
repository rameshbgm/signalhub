"use client";

import { useRef } from "react";

// Uptime bar heights — deterministic so server/client render match.
const BARS = Array.from({ length: 32 }, (_, i) => ({
  ok: i !== 9 && i !== 22,
  h: 14 + ((i * 7) % 10),
}));

export function Hero3D() {
  const ref = useRef<HTMLDivElement>(null);

  function onMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--tilt-y", `${x * 10}deg`);
    el.style.setProperty("--tilt-x", `${-y * 8}deg`);
  }

  function onLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--tilt-y", "0deg");
    el.style.setProperty("--tilt-x", "0deg");
  }

  return (
    <div className="scene select-none" onMouseMove={onMove} onMouseLeave={onLeave}>
      <div ref={ref} className="scene-inner relative h-[420px] sm:h-[480px]">
        {/* Main status page card */}
        <div className="card-3d float-a absolute left-[44%] top-1/2 w-[320px] -translate-x-1/2 -translate-y-1/2 border border-[var(--line-bright)] bg-[var(--surface)] shadow-[0_40px_80px_-24px_rgba(0,0,0,0.6)] sm:w-[380px]">
          <div className="flex items-center gap-2 border-b border-[var(--line)] px-5 py-3.5">
            <span
              className="relative inline-block h-2.5 w-2.5 rounded-full bg-[var(--green)] pulse-dot"
              style={{ "--pulse-color": "var(--green)" } as React.CSSProperties}
            />
            <span className="font-mono text-sm font-semibold text-[var(--fg)]">Example SignalHub</span>
            <span className="ml-auto font-mono text-[9px] tracking-wider text-[var(--fg-dim)]">PREVIEW</span>
          </div>
          <div className="mx-5 mt-4 border border-[var(--green)]/30 bg-[var(--green-soft)] px-4 py-3 text-sm font-medium text-[var(--green)]">
            All Systems Operational
          </div>
          <div className="space-y-3.5 px-5 py-5">
            {[
              { name: "REST API", pct: "99.99%" },
              { name: "Dashboard", pct: "99.97%" },
              { name: "Webhooks", pct: "99.94%" },
            ].map((c) => (
              <div key={c.name}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[var(--fg-soft)]">{c.name}</span>
                  <span className="font-mono text-[var(--fg-dim)]">{c.pct}</span>
                </div>
                <div className="mt-1.5 flex items-end gap-[2px]">
                  {BARS.map((b, i) => (
                    <span
                      key={i}
                      className="w-[7px]"
                      style={{ height: b.h, background: b.ok ? "var(--green)" : "var(--amber)", opacity: b.ok ? 0.85 : 1 }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Incident card, floating behind */}
        <div className="card-3d float-b absolute left-[2%] top-[4%] w-[230px] border border-[var(--line-bright)] bg-[var(--surface)] p-4 shadow-[0_24px_48px_-20px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[var(--amber)]" />
            <span className="font-mono text-[10px] tracking-wider text-[var(--fg-dim)]">INVESTIGATING</span>
          </div>
          <p className="mt-2 text-[13px] font-semibold leading-snug text-[var(--fg)]">Elevated latency on EU GraphQL API</p>
          <p className="mt-1.5 font-mono text-[10px] text-[var(--fg-dim)]">Example incident · 3 updates</p>
        </div>

        {/* Notified card, floating in front */}
        <div className="card-3d float-c absolute -bottom-10 right-0 w-[200px] border border-[var(--line-bright)] bg-[var(--surface)] p-4 shadow-[0_24px_48px_-20px_rgba(0,0,0,0.5)] sm:-bottom-8 sm:-right-2">
          <p className="font-mono text-[10px] tracking-wider text-[var(--fg-dim)]">DELIVERY CHANNELS</p>
          <p className="mt-1 font-mono text-lg font-semibold text-[var(--fg)]">Multi-channel</p>
          <p className="mt-1 text-[11px] text-[var(--fg-soft)]">email · SMS · webhooks · Slack</p>
        </div>
      </div>
    </div>
  );
}

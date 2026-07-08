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
        <div className="card-3d float-a absolute left-[44%] top-1/2 w-[320px] sm:w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gray-200 bg-white shadow-[0_40px_80px_-24px_rgba(16,21,17,0.25)]">
          <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3.5">
            <span className="relative inline-block h-2.5 w-2.5 rounded-full bg-[var(--up)] pulse-dot" />
            <span className="text-sm font-semibold">Acme Status</span>
            <span className="ml-auto font-mono text-[10px] tracking-wider text-gray-400">LIVE</span>
          </div>
          <div className="mx-5 mt-4 rounded-lg bg-[var(--up-soft)] px-4 py-3 text-sm font-medium text-[var(--up)]">
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
                  <span className="font-medium text-gray-700">{c.name}</span>
                  <span className="font-mono text-gray-400">{c.pct}</span>
                </div>
                <div className="mt-1.5 flex items-end gap-[2px]">
                  {BARS.map((b, i) => (
                    <span
                      key={i}
                      className="w-[7px] rounded-[1px]"
                      style={{ height: b.h, background: b.ok ? "var(--up)" : "var(--amber)", opacity: b.ok ? 0.85 : 1 }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Incident card, floating behind */}
        <div className="card-3d float-b absolute left-[2%] top-[4%] w-[230px] rounded-xl border border-gray-200 bg-white p-4 shadow-[0_24px_48px_-20px_rgba(16,21,17,0.2)]">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[var(--amber)]" />
            <span className="font-mono text-[10px] tracking-wider text-gray-400">INVESTIGATING</span>
          </div>
          <p className="mt-2 text-[13px] font-semibold leading-snug">Elevated latency on EU GraphQL API</p>
          <p className="mt-1.5 font-mono text-[10px] text-gray-400">14:02 UTC · 3 updates</p>
        </div>

        {/* Notified card, floating in front */}
        <div className="card-3d float-c absolute -bottom-10 right-0 w-[200px] rounded-xl border border-gray-200 bg-white p-4 shadow-[0_24px_48px_-20px_rgba(16,21,17,0.2)] sm:-bottom-8 sm:-right-2">
          <p className="font-mono text-[10px] tracking-wider text-gray-400">SUBSCRIBERS NOTIFIED</p>
          <p className="mt-1 font-display text-2xl font-semibold">12,482</p>
          <p className="mt-1 text-[11px] text-gray-500">email · SMS · webhooks · Slack</p>
        </div>
      </div>
    </div>
  );
}

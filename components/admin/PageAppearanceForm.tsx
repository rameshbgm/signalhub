"use client";

import { useState } from "react";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { PlatformSubmitButton } from "@/components/platform/PlatformSubmitButton";

type Preset = { key: string; label: string; description: string; colors: string[] };

export function PageAppearanceForm({
  action,
  presets,
  initialPreset,
  initialBrandColor,
  initialMode,
  initialAllowVisitorMode,
  customized,
}: {
  action: (formData: FormData) => void | Promise<void>;
  presets: Preset[];
  initialPreset: string;
  initialBrandColor: string;
  initialMode: "SYSTEM" | "LIGHT" | "DARK";
  initialAllowVisitorMode: boolean;
  customized: boolean;
}) {
  const [preset, setPreset] = useState(initialPreset);
  const [brandColor, setBrandColor] = useState(initialBrandColor);
  const [mode, setMode] = useState(initialMode);
  const [allowVisitorMode, setAllowVisitorMode] = useState(initialAllowVisitorMode);
  const selected = presets.find((item) => item.key === preset) ?? presets[0];

  return (
    <PlatformActionForm action={action} successMessage="Appearance saved" className="space-y-6">
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-mono text-sm font-semibold text-[var(--fg)]">Style preset</h3>
          {customized && preset === initialPreset && <span className="bg-[var(--amber-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--amber)]">Customized in advanced designer</span>}
        </div>
        <p className="mt-1 text-xs leading-5 text-[var(--fg-dim)]">Choose a starting style. Changing it resets advanced typography, spacing, shape, shadow, and palette overrides while preserving layout, content, and brand color.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {presets.map((item) => (
            <label key={item.key} className={`cursor-pointer border p-3 ${preset === item.key ? "border-[var(--cyan)] bg-[var(--cyan-soft)]" : "border-[var(--line)] bg-[var(--bg)]"}`}>
              <span className="flex items-center gap-2 text-sm font-semibold"><input type="radio" name="themePreset" value={item.key} checked={preset === item.key} onChange={() => setPreset(item.key)} />{item.label}</span>
              <span className="mt-2 flex gap-1" aria-hidden>{item.colors.map((color, index) => <span key={`${color}-${index}`} className="h-4 flex-1 border border-black/10" style={{ backgroundColor: color }} />)}</span>
              <span className="mt-2 block text-xs leading-5 text-[var(--fg-dim)]">{item.description}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="grid gap-5 border-t border-[var(--line)] pt-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-5">
          <label className="block text-xs font-semibold text-[var(--fg-soft)]">Brand color
            <span className="mt-2 flex items-center gap-3">
              <input type="color" name="brandColor" value={brandColor} onChange={(event) => setBrandColor(event.target.value)} className="h-10 w-14 border border-[var(--line)] bg-[var(--bg)]" />
              <input value={brandColor} onChange={(event) => setBrandColor(event.target.value)} pattern="#[0-9a-fA-F]{6}" aria-label="Brand color hex value" className="w-32 border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-mono text-sm uppercase" />
            </span>
          </label>
          <fieldset>
            <legend className="text-xs font-semibold text-[var(--fg-soft)]">Visitor appearance</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {[
                ["SYSTEM", "Match device", "Use each visitor's light or dark preference."],
                ["LIGHT", "Always light", "Keep the page in light mode."],
                ["DARK", "Always dark", "Keep the page in dark mode."],
              ].map(([value, label, description]) => <label key={value} className={`cursor-pointer border p-3 ${mode === value ? "border-[var(--cyan)] bg-[var(--cyan-soft)]" : "border-[var(--line)]"}`}><span className="flex items-center gap-2 text-sm font-semibold"><input type="radio" name="themeMode" value={value} checked={mode === value} onChange={() => setMode(value as typeof mode)} />{label}</span><span className="mt-1 block pl-5 text-xs leading-5 text-[var(--fg-dim)]">{description}</span></label>)}
            </div>
          </fieldset>
          {mode === "SYSTEM" && <label className="flex items-center gap-2 text-sm text-[var(--fg-soft)]"><input type="checkbox" name="allowThemeOverride" checked={allowVisitorMode} onChange={(event) => setAllowVisitorMode(event.target.checked)} /> Let visitors switch light/dark</label>}
          {mode !== "SYSTEM" && allowVisitorMode && <input type="hidden" name="allowThemeOverride" value="on" />}
        </div>
        <aside className="overflow-hidden border border-[var(--line)] bg-[var(--surface-raised)] p-3" aria-label="Style preview">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-dim)]">Quick preview</p>
          <div className="mt-3 overflow-hidden border" style={{ backgroundColor: selected.colors[0], borderColor: selected.colors[2], color: selected.colors[3] }}>
            <div className="flex items-center gap-2 border-b p-3" style={{ backgroundColor: selected.colors[1], borderColor: selected.colors[2] }}><span className="h-5 w-5 rounded-full" style={{ backgroundColor: brandColor }} /><strong className="text-xs">Service Status</strong></div>
            <div className="space-y-2 p-3"><div className="h-2 w-2/3" style={{ backgroundColor: brandColor }} /><div className="border p-3" style={{ backgroundColor: selected.colors[1], borderColor: selected.colors[2] }}><div className="h-2 w-full opacity-60" style={{ backgroundColor: selected.colors[3] }} /><div className="mt-2 h-2 w-4/5 opacity-30" style={{ backgroundColor: selected.colors[3] }} /></div></div>
          </div>
        </aside>
      </section>
      <div className="flex justify-end border-t border-[var(--line)] pt-5"><PlatformSubmitButton pendingLabel="Saving appearance…" className="bg-[var(--cyan)] px-5 py-2.5 text-sm font-semibold text-[var(--on-cyan)]">Save appearance</PlatformSubmitButton></div>
    </PlatformActionForm>
  );
}

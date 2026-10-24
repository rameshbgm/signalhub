"use client";

import { useEffect, useSyncExternalStore } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastTone = "ok" | "warn" | "danger" | "info";
type Toast = { id: number; tone: ToastTone; message: string };

const tones = {
  ok: { icon: CheckCircle2, color: "text-ok" },
  warn: { icon: AlertTriangle, color: "text-warn" },
  danger: { icon: XCircle, color: "text-danger" },
  info: { icon: Info, color: "text-info" },
} as const;

const DURATION_MS = 4000;
const MAX_VISIBLE = 3;

// Module-level store so any client code can call toast() without a provider or hook.
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function dismissToast(id: number) {
  toasts = toasts.filter((item) => item.id !== id);
  emit();
}

/** Shows a light, auto-dismissing message at the top center. Identical messages are not stacked. */
export function toast(message: string, tone: ToastTone = "info") {
  if (!message) return;
  const existing = toasts.find((item) => item.message === message && item.tone === tone);
  if (existing) dismissToast(existing.id);
  toasts = [...toasts, { id: nextId++, tone, message }].slice(-MAX_VISIBLE);
  emit();
}

/** Fires a toast whenever `message` changes to a non-empty value (replaces an inline status block). */
/** Pass `trigger` (e.g. an action-state object) to re-fire when the same message repeats. */
export function useToast(tone: ToastTone, message: string | null | undefined, trigger?: unknown) {
  useEffect(() => {
    if (message) toast(message, tone);
  }, [message, tone, trigger]);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

function ToastItem({ item }: { item: Toast }) {
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(item.id), DURATION_MS);
    return () => clearTimeout(timer);
  }, [item.id]);
  const { icon: Icon, color } = tones[item.tone];
  return (
    <div
      role={item.tone === "danger" || item.tone === "warn" ? "alert" : "status"}
      className="pointer-events-auto flex max-w-full animate-drop items-start gap-2.5 rounded-control border border-line bg-surface px-3.5 py-2.5 text-sm text-ink shadow-float"
    >
      <Icon aria-hidden size={18} className={cn("mt-0.5 shrink-0", color)} />
      <p className="min-w-0 break-words leading-6">{item.message}</p>
      <button type="button" aria-label="Dismiss" onClick={() => dismissToast(item.id)} className="-mr-1 mt-0.5 shrink-0 rounded text-ink-dim hover:text-ink">
        <X aria-hidden size={16} />
      </button>
    </div>
  );
}

export function Toaster() {
  const items = useSyncExternalStore(subscribe, () => toasts, () => toasts);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-[3000] flex flex-col items-center gap-2 px-3 sm:top-4">
      {items.map((item) => <ToastItem key={item.id} item={item} />)}
    </div>
  );
}

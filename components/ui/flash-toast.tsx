"use client";

import { useToast, type ToastTone } from "@/components/ui/toast";

/** Lets a server component raise a toast for a message it computed during render (e.g. a redirect result). */
export function FlashToast({ tone, message }: { tone: ToastTone; message: string }) {
  useToast(tone, message);
  return null;
}

"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useActionState } from "react";
import { toast } from "@/components/ui/toast";
import { runPlatformActionWithFeedback } from "@/app/platform/(protected)/action-feedback";

type FormAction = (formData: FormData) => void | string | Promise<void | string>;
type FeedbackState = { status: "idle"; message: "" } | { status: "success" | "error"; message: string };

const INITIAL_STATE: FeedbackState = { status: "idle", message: "" };

/** Groups small action buttons. Failures from InlineActionForm children surface as toasts. */
export function ActionRow({ children, className }: { children: ReactNode; className?: string; messageClassName?: string }) {
  return <div className={className}>{children}</div>;
}

/**
 * Form for one-click server actions that reports failures as a toast instead of the route error screen.
 * Success stays silent: the revalidated page is the feedback. Redirects from the action still navigate.
 */
export function InlineActionForm({ action, children, className }: { action: FormAction; children: ReactNode; className?: string; messageClassName?: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(runPlatformActionWithFeedback.bind(null, action, ""), INITIAL_STATE);
  const error = !pending && state.status === "error" ? state.message : "";

  useEffect(() => {
    if (pending) return;
    // Plain submit buttons stay enabled, so tell ButtonInteractionGuard the action settled.
    formRef.current?.dispatchEvent(new Event("signalhub:button-action-complete", { bubbles: true }));
    if (error) toast(error, "danger");
  }, [error, pending, state]);

  return (
    <form ref={formRef} action={formAction} className={className}>
      {children}
    </form>
  );
}

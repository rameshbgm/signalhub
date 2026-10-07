"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useActionState } from "react";
import { XCircle } from "lucide-react";
import { runPlatformActionWithFeedback } from "@/app/platform/(protected)/action-feedback";
import { cn } from "@/lib/utils";

type FormAction = (formData: FormData) => void | string | Promise<void | string>;
type FeedbackState = { status: "idle"; message: "" } | { status: "success" | "error"; message: string };

const INITIAL_STATE: FeedbackState = { status: "idle", message: "" };
const ReportContext = createContext<((message: string) => void) | null>(null);

function ErrorText({ message, className }: { message: string; className?: string }) {
  return (
    <p role="alert" className={cn("flex items-start gap-1.5 text-xs font-medium text-danger-fg", className)}>
      <XCircle aria-hidden size={14} className="mt-px shrink-0" />
      {message}
    </p>
  );
}

/** Groups small action buttons and shows the last failed action's message once, under the whole row. */
export function ActionRow({ children, className, messageClassName }: { children: ReactNode; className?: string; messageClassName?: string }) {
  const [error, setError] = useState("");
  return (
    <ReportContext.Provider value={setError}>
      <div className="flex flex-col gap-1.5">
        <div className={className}>{children}</div>
        <div aria-live="assertive" aria-atomic="true">{error && <ErrorText message={error} className={messageClassName} />}</div>
      </div>
    </ReportContext.Provider>
  );
}

/**
 * Form for one-click server actions that reports failures inline instead of the route error screen.
 * Success stays silent: the revalidated page is the feedback. Redirects from the action still navigate.
 */
export function InlineActionForm({ action, children, className, messageClassName }: { action: FormAction; children: ReactNode; className?: string; messageClassName?: string }) {
  const report = useContext(ReportContext);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(runPlatformActionWithFeedback.bind(null, action, ""), INITIAL_STATE);
  const error = !pending && state.status === "error" ? state.message : "";

  useEffect(() => {
    if (pending) return;
    // Plain submit buttons stay enabled, so tell ButtonInteractionGuard the action settled.
    formRef.current?.dispatchEvent(new Event("signalhub:button-action-complete", { bubbles: true }));
    report?.(error);
  }, [error, pending, report, state]);

  return (
    <form ref={formRef} action={formAction} className={className}>
      {children}
      {!report && error && <ErrorText message={error} className={cn("mt-1.5", messageClassName)} />}
    </form>
  );
}

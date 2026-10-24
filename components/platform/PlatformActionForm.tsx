"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useTransition, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { runPlatformActionWithFeedback } from "@/app/platform/(protected)/action-feedback";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type PlatformAction = (formData: FormData) => void | string | Promise<void | string>;

type ActionFeedbackState =
  | { status: "idle"; message: "" }
  | { status: "success" | "error"; message: string };

const INITIAL_STATE: ActionFeedbackState = { status: "idle", message: "" };

type PlatformActionFormProps = Omit<
  ComponentPropsWithoutRef<"form">,
  "action" | "children"
> & {
  action: PlatformAction;
  children: ReactNode;
  successMessage: string;
  messageClassName?: string;
  onSuccess?: () => void;
  /** Keep what was typed when the action fails. React otherwise resets a `<form action>` after every submit. */
  preserveOnError?: boolean;
};

export function PlatformActionForm({
  action,
  children,
  successMessage,
  messageClassName: _messageClassName, // ponytail: feedback is a toast now, prop kept so callers need no change
  onSuccess,
  preserveOnError,
  ...formProps
}: PlatformActionFormProps) {
  const formClassName = formProps.className ?? "";
  const [state, formAction] = useActionState(
    runPlatformActionWithFeedback.bind(null, action, successMessage),
    INITIAL_STATE
  );

  const formRef = useRef<HTMLFormElement>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const refreshed = useRef<ActionFeedbackState>(INITIAL_STATE);
  // revalidatePath targets internal routes, which a proxy-rewritten public URL can miss, so refresh explicitly (once per result).
  useEffect(() => {
    if (state.status === "idle" || refreshed.current === state) return;
    refreshed.current = state;
    toast(state.message, state.status === "error" ? "danger" : "ok");
    // The button guard normally unlocks on React's form reset, which preserveOnError skips.
    if (preserveOnError) formRef.current?.dispatchEvent(new Event("signalhub:button-action-complete", { bubbles: true }));
    if (state.status === "error") return;
    router.refresh();
    onSuccess?.();
  }, [onSuccess, preserveOnError, router, state]);

  return (
    <form
      ref={formRef}
      {...(preserveOnError
        ? {
            // Submitting through onSubmit instead of the `action` prop is what skips React's automatic form reset.
            onSubmit: (event: React.FormEvent<HTMLFormElement>) => {
              // React bubbles submit events up through portals, e.g. from a dialog's own form rendered inside this one.
              if (event.target !== event.currentTarget) return;
              event.preventDefault();
              const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
              startTransition(() => formAction(data));
            },
          }
        : { action: formAction })}
      {...formProps}
      className={cn(formClassName, formClassName.includes("flex") && "flex-wrap")}
    >
      {children}
    </form>
  );
}

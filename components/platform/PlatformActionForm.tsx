"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { runPlatformActionWithFeedback } from "@/app/platform/(protected)/action-feedback";
import { Alert } from "@/components/ui/alert";
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
};

export function PlatformActionForm({
  action,
  children,
  successMessage,
  messageClassName = "",
  onSuccess,
  ...formProps
}: PlatformActionFormProps) {
  const formClassName = formProps.className ?? "";
  const [state, formAction, pending] = useActionState(
    runPlatformActionWithFeedback.bind(null, action, successMessage),
    INITIAL_STATE
  );
  const feedback = pending ? INITIAL_STATE : state;

  const router = useRouter();
  const refreshed = useRef<ActionFeedbackState>(INITIAL_STATE);
  // revalidatePath targets internal routes, which a proxy-rewritten public URL can miss, so refresh explicitly (once per result).
  useEffect(() => {
    if (state.status !== "success") return;
    if (refreshed.current !== state) {
      refreshed.current = state;
      router.refresh();
    }
    onSuccess?.();
  }, [onSuccess, router, state]);

  return (
    <form
      action={formAction}
      {...formProps}
      className={cn(formClassName, formClassName.includes("flex") && "flex-wrap")}
    >
      {children}
      <div
        aria-atomic="true"
        aria-live={feedback.status === "error" ? "assertive" : "polite"}
        role={feedback.status === "error" ? "alert" : "status"}
        className={cn("w-full basis-full", messageClassName)}
      >
        {feedback.status !== "idle" && (
          <Alert tone={feedback.status === "error" ? "danger" : "ok"} role={undefined}>
            {feedback.message}
          </Alert>
        )}
      </div>
    </form>
  );
}

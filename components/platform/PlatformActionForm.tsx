"use client";

import { useActionState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { runPlatformActionWithFeedback } from "@/app/platform/(protected)/action-feedback";

type PlatformAction = (formData: FormData) => void | Promise<void>;

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
};

export function PlatformActionForm({
  action,
  children,
  successMessage,
  messageClassName = "",
  ...formProps
}: PlatformActionFormProps) {
  const [state, formAction, pending] = useActionState(
    runPlatformActionWithFeedback.bind(null, action, successMessage),
    INITIAL_STATE
  );
  const feedback = pending ? INITIAL_STATE : state;

  return (
    <form action={formAction} {...formProps}>
      {children}
      <p
        aria-atomic="true"
        aria-live={feedback.status === "error" ? "assertive" : "polite"}
        role={feedback.status === "error" ? "alert" : "status"}
        className={`w-full basis-full text-xs ${
          feedback.status === "error"
            ? "text-[var(--red)]"
            : feedback.status === "success"
              ? "text-[var(--green)]"
              : ""
        } ${messageClassName}`}
      >
        {feedback.message}
      </p>
    </form>
  );
}

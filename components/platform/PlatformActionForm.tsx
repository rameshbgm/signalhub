"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
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
};

export function PlatformActionForm({
  action,
  children,
  successMessage,
  messageClassName: _messageClassName, // ponytail: feedback is a toast now, prop kept so callers need no change
  onSuccess,
  ...formProps
}: PlatformActionFormProps) {
  const formClassName = formProps.className ?? "";
  const [state, formAction] = useActionState(
    runPlatformActionWithFeedback.bind(null, action, successMessage),
    INITIAL_STATE
  );

  const router = useRouter();
  const refreshed = useRef<ActionFeedbackState>(INITIAL_STATE);
  // revalidatePath targets internal routes, which a proxy-rewritten public URL can miss, so refresh explicitly (once per result).
  useEffect(() => {
    if (state.status === "idle" || refreshed.current === state) return;
    refreshed.current = state;
    toast(state.message, state.status === "error" ? "danger" : "ok");
    if (state.status === "error") return;
    router.refresh();
    onSuccess?.();
  }, [onSuccess, router, state]);

  return (
    <form
      action={formAction}
      {...formProps}
      className={cn(formClassName, formClassName.includes("flex") && "flex-wrap")}
    >
      {children}
    </form>
  );
}

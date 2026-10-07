"use server";

import { unstable_rethrow } from "next/navigation";

/** An action may return a message that replaces the default success text. */
type PlatformAction = (formData: FormData) => void | string | Promise<void | string>;

type ActionFeedbackState =
  | { status: "idle"; message: "" }
  | { status: "success" | "error"; message: string };

const GENERIC_ERROR =
  "The operation could not be completed. Reload and try again.";

export async function runPlatformActionWithFeedback(
  action: PlatformAction,
  successMessage: string,
  _previous: ActionFeedbackState,
  formData: FormData
): Promise<ActionFeedbackState> {
  try {
    const result = await action(formData);
    return { status: "success", message: typeof result === "string" ? result : successMessage };
  } catch (error) {
    // Preserve redirect/not-found and other framework control flow while
    // converting expected operator errors into serializable action state.
    unstable_rethrow(error);

    const validationMessage =
      error instanceof Error &&
      error.name === "ZodError" &&
      "issues" in error &&
      Array.isArray(error.issues) &&
      typeof error.issues[0]?.message === "string"
        ? error.issues[0].message
        : null;
    const message =
      validationMessage && validationMessage.length <= 500
        ? `Check the form values: ${validationMessage}`
        : error instanceof Error &&
            error.name === "Error" &&
            error.message.length <= 500
          ? error.message
          : GENERIC_ERROR;
    // The visitor sees a generic message; operators need the real cause.
    if (message === GENERIC_ERROR) console.error("Server action failed", error);
    return { status: "error", message };
  }
}

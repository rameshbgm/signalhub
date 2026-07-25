"use server";

import { unstable_rethrow } from "next/navigation";

type PlatformAction = (formData: FormData) => void | Promise<void>;

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
    await action(formData);
    return { status: "success", message: successMessage };
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
    return { status: "error", message };
  }
}

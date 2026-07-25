import { describe, expect, it } from "vitest";
import { runPlatformActionWithFeedback } from "../app/platform/(protected)/action-feedback";

const IDLE = { status: "idle", message: "" } as const;

describe("platform action feedback", () => {
  it("returns serializable success state from the server boundary", async () => {
    const state = await runPlatformActionWithFeedback(
      async () => undefined,
      "Updated.",
      IDLE,
      new FormData()
    );

    expect(state).toEqual({ status: "success", message: "Updated." });
  });

  it("returns expected operator errors without relying on client error details", async () => {
    const state = await runPlatformActionWithFeedback(
      async () => {
        throw new Error("The record changed; reload and retry");
      },
      "Updated.",
      IDLE,
      new FormData()
    );

    expect(state).toEqual({
      status: "error",
      message: "The record changed; reload and retry",
    });
  });

  it("does not expose unexpected implementation errors", async () => {
    const databaseError = new Error("database host and collection details");
    databaseError.name = "MongoServerError";

    const state = await runPlatformActionWithFeedback(
      async () => {
        throw databaseError;
      },
      "Updated.",
      IDLE,
      new FormData()
    );

    expect(state).toEqual({
      status: "error",
      message: "The operation could not be completed. Reload and try again.",
    });
  });

  it("returns safe validation detail", async () => {
    const validationError = new Error("raw validation payload");
    validationError.name = "ZodError";
    Object.assign(validationError, {
      issues: [{ message: "Name must contain at least 2 characters" }],
    });

    const state = await runPlatformActionWithFeedback(
      async () => {
        throw validationError;
      },
      "Updated.",
      IDLE,
      new FormData()
    );

    expect(state).toEqual({
      status: "error",
      message:
        "Check the form values: Name must contain at least 2 characters",
    });
  });
});

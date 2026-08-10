import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AdminAuthError } from "@/lib/admin-guard";
import { OrganizationMutationBlockedError } from "@/lib/organization-mutation";
import { errorFields, logger } from "@/lib/logger";

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[] | undefined>;
  };
};

export function apiError(
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string[] | undefined>
) {
  return NextResponse.json<ApiErrorBody>(
    { error: { code, message, ...(fields ? { fields } : {}) } },
    { status }
  );
}

export function validationError(error: ZodError) {
  return apiError(400, "VALIDATION_ERROR", "The request contains invalid fields", error.flatten().fieldErrors);
}

export function routeError(
  error: unknown,
  context: Record<string, unknown> = {}
) {
  if (error instanceof AdminAuthError) {
    if (error.status >= 500) {
      logger.error({ ...context, ...errorFields(error), code: error.code, status: error.status }, "API authorization failed");
    }
    return apiError(error.status, error.code, error.message);
  }
  if (error instanceof OrganizationMutationBlockedError) {
    logger.warn({ ...context, code: "ORGANIZATION_INACTIVE" }, "Organization mutation rejected");
    return apiError(
      409,
      "ORGANIZATION_INACTIVE",
      "This organization is not active"
    );
  }
  logger.error({ ...context, ...errorFields(error) }, "Unhandled API route error");
  return apiError(500, "INTERNAL_ERROR", "An unexpected server error occurred");
}

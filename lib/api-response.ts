import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AdminAuthError } from "@/lib/admin-guard";
import { InvalidObjectIdError } from "@/lib/mongo-utils";
import { OrganizationMutationBlockedError } from "@/lib/organization-mutation";

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

export function routeError(error: unknown) {
  if (error instanceof AdminAuthError) {
    return apiError(error.status, error.code, error.message);
  }
  if (error instanceof InvalidObjectIdError) {
    return apiError(400, "MALFORMED_ID", "The supplied identifier is malformed");
  }
  if (error instanceof OrganizationMutationBlockedError) {
    return apiError(
      409,
      "ORGANIZATION_INACTIVE",
      "This organization is not active"
    );
  }
  console.error(error);
  return apiError(500, "INTERNAL_ERROR", "An unexpected server error occurred");
}
